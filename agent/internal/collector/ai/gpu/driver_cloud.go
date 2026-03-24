package gpu

// cloudDriver detects and collects GPU metadata for:
//   - Cloud VM GPU instances (AWS p/g, GCP a2/a3, Azure NC/ND)
//   - Kubernetes pods with GPU device plugin allocations (nvidia.com/gpu, amd.com/gpu, gpu.intel.com/i915)
//   - K8s MIG + GPU partition mapping via node capacity API

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type cloudDriver struct{}

func newCloudDriver() Driver { return &cloudDriver{} }

func (d *cloudDriver) Vendor() Vendor { return VendorVirtual }

func (d *cloudDriver) Detect(ctx context.Context) bool {
	if runtime.GOOS != "linux" {
		return false
	}
	return cloudIsK8sPod() || cloudDetectType(ctx) != ""
}

func (d *cloudDriver) Collect(ctx context.Context) ([]GPUMetric, error) {
	var metrics []GPUMetric

	if m := cloudK8sGPU(); m != nil {
		metrics = append(metrics, *m)
	}

	if ct := cloudDetectType(ctx); ct != "" {
		metrics = append(metrics, cloudVGPU(ctx, ct)...)
	}

	if len(metrics) == 0 {
		return nil, fmt.Errorf("no cloud/K8s GPU environment detected")
	}
	return metrics, nil
}

func cloudIsK8sPod() bool {
	_, err := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount/token")
	return err == nil
}

func cloudDetectType(ctx context.Context) string {
	cli := &http.Client{Timeout: 300 * time.Millisecond}

	if req, err := http.NewRequestWithContext(ctx, "GET",
		"http://169.254.169.254/latest/meta-data/instance-type", nil); err == nil {
		if resp, err := cli.Do(req); err == nil {
			resp.Body.Close()
			return "aws"
		}
	}
	if req, err := http.NewRequestWithContext(ctx, "GET",
		"http://metadata.google.internal/computeMetadata/v1/instance/machine-type", nil); err == nil {
		req.Header.Set("Metadata-Flavor", "Google")
		if resp, err := cli.Do(req); err == nil {
			resp.Body.Close()
			return "gcp"
		}
	}
	if req, err := http.NewRequestWithContext(ctx, "GET",
		"http://169.254.169.254/metadata/instance?api-version=2021-02-01", nil); err == nil {
		req.Header.Set("Metadata", "true")
		if resp, err := cli.Do(req); err == nil {
			resp.Body.Close()
			return "azure"
		}
	}
	return ""
}

func cloudK8sGPU() *GPUMetric {
	if !cloudIsK8sPod() {
		return nil
	}
	nvidiaDevs := os.Getenv("NVIDIA_VISIBLE_DEVICES")
	amdDevs := os.Getenv("GPU_DEVICE_ORDINAL")
	intelDevs := os.Getenv("INTEL_GPU_DEVICE")

	var resType, resDevs string
	switch {
	case nvidiaDevs != "" && nvidiaDevs != "none":
		resType, resDevs = "nvidia.com/gpu", nvidiaDevs
	case amdDevs != "":
		resType, resDevs = "amd.com/gpu", amdDevs
	case intelDevs != "":
		resType, resDevs = "gpu.intel.com/i915", intelDevs
	default:
		if data, err := os.ReadFile("/etc/podinfo/gpu-limit"); err == nil {
			resType = "k8s/gpu"
			resDevs = strings.TrimSpace(string(data))
		} else {
			return nil
		}
	}

	extra := map[string]string{
		"k8s_resource": resType,
		"k8s_devices":  resDevs,
	}
	if ns := os.Getenv("POD_NAMESPACE"); ns != "" {
		extra["k8s_namespace"] = ns
	}
	if pod := os.Getenv("POD_NAME"); pod != "" {
		extra["k8s_pod"] = pod
	}
	if node := os.Getenv("NODE_NAME"); node != "" {
		extra["k8s_node"] = node
		for k, v := range cloudK8sNodeCapacity(node) {
			extra[k] = v
		}
	}

	return &GPUMetric{
		Index:     0,
		Name:      fmt.Sprintf("K8s GPU (%s)", resType),
		Vendor:    VendorVirtual,
		IsVirtual: true,
		Extra:     extra,
	}
}

func cloudK8sNodeCapacity(nodeName string) map[string]string {
	token, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")
	if err != nil {
		return nil
	}
	host := os.Getenv("KUBERNETES_SERVICE_HOST")
	port := os.Getenv("KUBERNETES_SERVICE_PORT")
	if host == "" || port == "" {
		return nil
	}
	url := fmt.Sprintf("https://%s:%s/api/v1/nodes/%s", host, port, nodeName)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(token)))

	resp, err := (&http.Client{Timeout: 2 * time.Second}).Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var ns struct {
		Status struct {
			Capacity    map[string]string `json:"capacity"`
			Allocatable map[string]string `json:"allocatable"`
		} `json:"status"`
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return nil
	}
	if err := json.Unmarshal(body, &ns); err != nil {
		return nil
	}

	result := make(map[string]string)
	for _, key := range []string{"nvidia.com/gpu", "amd.com/gpu", "gpu.intel.com/i915"} {
		safe := strings.ReplaceAll(key, "/", "_")
		if v, ok := ns.Status.Capacity[key]; ok {
			result["node_capacity_"+safe] = v
		}
		if v, ok := ns.Status.Allocatable[key]; ok {
			result["node_allocatable_"+safe] = v
		}
	}
	return result
}

func cloudVGPU(ctx context.Context, cloudType string) []GPUMetric {
	switch cloudType {
	case "aws":
		return cloudAWSGPU(ctx)
	case "gcp":
		return cloudGCPGPU(ctx)
	case "azure":
		return cloudAzureGPU(ctx)
	}
	return nil
}

var awsGPUInstances = map[string]string{
	"p4d.24xlarge":  "8x NVIDIA A100 40GB",
	"p4de.24xlarge": "8x NVIDIA A100 80GB",
	"p3.2xlarge":    "1x NVIDIA V100 16GB",
	"p3.8xlarge":    "4x NVIDIA V100 16GB",
	"p3.16xlarge":   "8x NVIDIA V100 16GB",
	"p3dn.24xlarge": "8x NVIDIA V100 32GB",
	"g5.xlarge":     "1x NVIDIA A10G 24GB",
	"g5.12xlarge":   "4x NVIDIA A10G 24GB",
	"g5.48xlarge":   "8x NVIDIA A10G 24GB",
	"g4dn.xlarge":   "1x NVIDIA T4 16GB",
	"g4dn.12xlarge": "4x NVIDIA T4 16GB",
	"inf1.xlarge":   "1x AWS Inferentia",
	"inf2.xlarge":   "1x AWS Inferentia2",
	"trn1.2xlarge":  "1x AWS Trainium",
}

var gcpGPUMachines = map[string]string{
	"a2-highgpu-1g":  "1x NVIDIA A100 40GB",
	"a2-highgpu-2g":  "2x NVIDIA A100 40GB",
	"a2-highgpu-4g":  "4x NVIDIA A100 40GB",
	"a2-highgpu-8g":  "8x NVIDIA A100 40GB",
	"a2-megagpu-16g": "16x NVIDIA A100 40GB",
	"a3-highgpu-8g":  "8x NVIDIA H100 80GB",
}

var azureGPUVMs = map[string]string{
	"Standard_NC6s_v3":         "1x NVIDIA V100 16GB",
	"Standard_NC12s_v3":        "2x NVIDIA V100 16GB",
	"Standard_NC24s_v3":        "4x NVIDIA V100 16GB",
	"Standard_ND40rs_v2":       "8x NVIDIA V100 32GB",
	"Standard_NC24ads_A100_v4": "1x NVIDIA A100 80GB",
	"Standard_NC48ads_A100_v4": "2x NVIDIA A100 80GB",
	"Standard_NC96ads_A100_v4": "4x NVIDIA A100 80GB",
}

func cloudAWSGPU(ctx context.Context) []GPUMetric {
	it := cloudFetch(ctx, "http://169.254.169.254/latest/meta-data/instance-type", nil)
	if it == "" {
		return nil
	}
	name, ok := awsGPUInstances[it]
	if !ok {
		if !strings.HasPrefix(it, "p") && !strings.HasPrefix(it, "g") &&
			!strings.HasPrefix(it, "inf") && !strings.HasPrefix(it, "trn") {
			return nil
		}
		name = "AWS GPU Instance (" + it + ")"
	}
	return []GPUMetric{{
		Index: 0, Name: name, Vendor: VendorVirtual, IsVirtual: true,
		Extra: map[string]string{"cloud": "aws", "instance_type": it},
	}}
}

func cloudGCPGPU(ctx context.Context) []GPUMetric {
	mt := cloudFetch(ctx,
		"http://metadata.google.internal/computeMetadata/v1/instance/machine-type",
		map[string]string{"Metadata-Flavor": "Google"})
	if mt == "" {
		return nil
	}
	mt = filepath.Base(mt)
	name, ok := gcpGPUMachines[mt]
	if !ok {
		if !strings.HasPrefix(mt, "a2") && !strings.HasPrefix(mt, "a3") {
			return nil
		}
		name = "GCP GPU Instance (" + mt + ")"
	}
	return []GPUMetric{{
		Index: 0, Name: name, Vendor: VendorVirtual, IsVirtual: true,
		Extra: map[string]string{"cloud": "gcp", "machine_type": mt},
	}}
}

func cloudAzureGPU(ctx context.Context) []GPUMetric {
	vs := cloudFetch(ctx,
		"http://169.254.169.254/metadata/instance/compute/vmSize?api-version=2021-02-01&format=text",
		map[string]string{"Metadata": "true"})
	if vs == "" {
		return nil
	}
	name, ok := azureGPUVMs[vs]
	if !ok {
		if !strings.HasPrefix(vs, "Standard_NC") &&
			!strings.HasPrefix(vs, "Standard_ND") &&
			!strings.HasPrefix(vs, "Standard_NV") {
			return nil
		}
		name = "Azure GPU VM (" + vs + ")"
	}
	return []GPUMetric{{
		Index: 0, Name: name, Vendor: VendorVirtual, IsVirtual: true,
		Extra: map[string]string{"cloud": "azure", "vm_size": vs},
	}}
}

func cloudFetch(ctx context.Context, url string, headers map[string]string) string {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return ""
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := (&http.Client{Timeout: 300 * time.Millisecond}).Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	buf, err := io.ReadAll(io.LimitReader(resp.Body, 256))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(buf))
}
