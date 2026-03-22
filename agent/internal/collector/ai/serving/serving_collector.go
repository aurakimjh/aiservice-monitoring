package serving

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// servingFramework describes a known model serving framework.
type servingFramework struct {
	Name        string
	ProcessName string
	DefaultPort int
	HealthPath  string
	ModelsPath  string
	ConfigFiles []string
}

var knownFrameworks = []servingFramework{
	{
		Name: "vllm", ProcessName: "vllm", DefaultPort: 8000,
		HealthPath: "/health", ModelsPath: "/v1/models",
		ConfigFiles: []string{"vllm_config.yaml", "serving_config.yaml"},
	},
	{
		Name: "ollama", ProcessName: "ollama", DefaultPort: 11434,
		HealthPath: "/api/tags", ModelsPath: "/api/tags",
		ConfigFiles: []string{"ollama_config.yaml"},
	},
	{
		Name: "triton", ProcessName: "tritonserver", DefaultPort: 8000,
		HealthPath: "/v2/health/ready", ModelsPath: "/v2/models",
		ConfigFiles: []string{"triton_config.yaml", "config.pbtxt"},
	},
	{
		Name: "text-generation-inference", ProcessName: "text-generation-launcher", DefaultPort: 8080,
		HealthPath: "/health", ModelsPath: "/info",
		ConfigFiles: []string{"tgi_config.yaml"},
	},
	{
		Name: "ray-serve", ProcessName: "ray", DefaultPort: 8265,
		HealthPath: "/api/version", ModelsPath: "/api/serve/deployments/",
		ConfigFiles: []string{"ray_serve_config.yaml"},
	},
}

// Collector gathers model serving health, batching/quantization/KV cache config,
// and optional Kubernetes GPU resource information.
type Collector struct {
	httpClient *http.Client
}

func New() *Collector {
	return &Collector{
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *Collector) ID() string      { return "ai-model-serving" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	privs := []models.Privilege{
		{Type: "net", Target: "localhost:8000", Description: "access vLLM/Triton serving endpoint"},
		{Type: "net", Target: "localhost:11434", Description: "access Ollama serving endpoint"},
		{Type: "net", Target: "localhost:8080", Description: "access TGI serving endpoint"},
		{Type: "read", Target: ".", Description: "read serving config files"},
	}
	if runtime.GOOS == "linux" {
		privs = append(privs,
			models.Privilege{Type: "exec", Target: "kubectl", Description: "query K8s GPU resource limits"},
		)
	}
	return privs
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"ai.model_serving_health.v1",
		"ai.batching_config.v1",
		"ai.quantization_config.v1",
		"ai.kvcache_config.v1",
		"ai.k8s_gpu_resources.v1",
	}
}

// AutoDetect returns true if any known model serving framework is running.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	details := map[string]string{}

	for _, fw := range knownFrameworks {
		if isProcessRunning(fw.ProcessName) {
			details[fw.Name+"_process"] = fw.ProcessName
		}
		if fw.DefaultPort > 0 && c.pingHTTP(ctx, fmt.Sprintf("http://localhost:%d%s", fw.DefaultPort, fw.HealthPath)) {
			details[fw.Name+"_port"] = fmt.Sprintf("%d", fw.DefaultPort)
		}
	}

	// Detect from env vars
	servingEnvs := map[string]string{
		"VLLM_MODEL":        "vllm_model",
		"MODEL_NAME":        "model_name",
		"SERVED_MODEL_NAME": "served_model",
		"HF_MODEL_ID":       "hf_model",
	}
	for envKey, detailKey := range servingEnvs {
		if val := os.Getenv(envKey); val != "" {
			details[detailKey] = val
		}
	}

	if len(details) == 0 {
		return models.DetectResult{Detected: false}, nil
	}
	return models.DetectResult{Detected: true, Details: details}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	var errs []models.CollectError

	// Serving health
	if item, err := c.collectServingHealth(ctx); err == nil {
		result.Items = append(result.Items, *item)
	} else {
		errs = append(errs, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("model serving health collection failed: %v", err),
		})
	}

	// Batching / quantization / KV cache config
	if item, err := c.collectServingConfig(); err == nil {
		result.Items = append(result.Items, *item)
	}

	// K8s GPU resources (best-effort, Linux only)
	if runtime.GOOS == "linux" {
		if item, err := c.collectK8sGPUResources(ctx); err == nil {
			result.Items = append(result.Items, *item)
		}
	}

	result.Errors = errs
	result.Duration = time.Since(start)

	if len(result.Items) == 0 && len(errs) > 0 {
		result.Status = models.StatusFailed
	} else if len(errs) > 0 {
		result.Status = models.StatusPartial
	}

	return result, nil
}

// ServingInstanceStatus holds health and model info for a serving endpoint.
type ServingInstanceStatus struct {
	Framework string   `json:"framework"`
	Port      int      `json:"port"`
	Healthy   bool     `json:"healthy"`
	Models    []string `json:"models,omitempty"`
	Error     string   `json:"error,omitempty"`
}

func (c *Collector) collectServingHealth(ctx context.Context) (*models.CollectedItem, error) {
	instances := []ServingInstanceStatus{}

	for _, fw := range knownFrameworks {
		if !isProcessRunning(fw.ProcessName) {
			healthURL := fmt.Sprintf("http://localhost:%d%s", fw.DefaultPort, fw.HealthPath)
			if !c.pingHTTP(ctx, healthURL) {
				continue
			}
		}

		status := ServingInstanceStatus{
			Framework: fw.Name,
			Port:      fw.DefaultPort,
		}

		healthURL := fmt.Sprintf("http://localhost:%d%s", fw.DefaultPort, fw.HealthPath)
		if c.pingHTTP(ctx, healthURL) {
			status.Healthy = true
			// Try to list loaded models
			modelsURL := fmt.Sprintf("http://localhost:%d%s", fw.DefaultPort, fw.ModelsPath)
			if modelNames := c.fetchModelNames(ctx, fw.Name, modelsURL); len(modelNames) > 0 {
				status.Models = modelNames
			}
		} else {
			status.Error = "health check failed"
		}

		instances = append(instances, status)
	}

	healthy := 0
	for _, i := range instances {
		if i.Healthy {
			healthy++
		}
	}

	return &models.CollectedItem{
		SchemaName:    "ai.model_serving_health",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_model_serving_health",
		Category:      "ai",
		Data: map[string]interface{}{
			"frameworks_found":   len(instances),
			"frameworks_healthy": healthy,
			"instances":          instances,
		},
	}, nil
}

// fetchModelNames calls the models endpoint and returns model name list.
func (c *Collector) fetchModelNames(ctx context.Context, framework, url string) []string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return nil
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil
	}

	names := []string{}

	switch framework {
	case "vllm", "text-generation-inference":
		// OpenAI-compatible: {"data": [{"id": "model-name"}, ...]}
		if data, ok := raw["data"].([]interface{}); ok {
			for _, item := range data {
				if m, ok := item.(map[string]interface{}); ok {
					if id, ok := m["id"].(string); ok {
						names = append(names, id)
					}
				}
			}
		}
	case "ollama":
		// {"models": [{"name": "llama2", ...}, ...]}
		if models, ok := raw["models"].([]interface{}); ok {
			for _, item := range models {
				if m, ok := item.(map[string]interface{}); ok {
					if name, ok := m["name"].(string); ok {
						names = append(names, name)
					}
				}
			}
		}
	case "triton":
		// {"models": [{"name": "model", "state": "READY"}, ...]}
		if modelList, ok := raw["models"].([]interface{}); ok {
			for _, item := range modelList {
				if m, ok := item.(map[string]interface{}); ok {
					if name, ok := m["name"].(string); ok {
						names = append(names, name)
					}
				}
			}
		}
	}

	return names
}

// collectServingConfig reads batching, quantization, and KV cache configuration.
func (c *Collector) collectServingConfig() (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"config_found": false,
	}

	// Common serving config keys
	batchingKeys := []string{
		"max_batch_size", "max_num_seqs", "max_num_batched_tokens",
		"continuous_batching", "dynamic_batching", "batch_timeout_ms",
	}
	quantKeys := []string{
		"quantization", "quantization_method", "bits", "load_in_4bit",
		"load_in_8bit", "awq", "gptq", "gguf",
	}
	kvCacheKeys := []string{
		"kv_cache_dtype", "gpu_memory_utilization", "max_model_len",
		"block_size", "swap_space", "enable_prefix_caching",
		"use_paged_attention", "max_context_len",
	}
	mlopsKeys := []string{
		"model_registry", "mlflow_tracking_uri", "wandb_project",
		"model_version", "model_stage",
	}

	allKeys := append(append(append(batchingKeys, quantKeys...), kvCacheKeys...), mlopsKeys...)

	// Scan all known config files
	allConfigFiles := []string{}
	for _, fw := range knownFrameworks {
		allConfigFiles = append(allConfigFiles, fw.ConfigFiles...)
	}
	allConfigFiles = append(allConfigFiles, "model_config.yaml", "config.yaml")

	for _, configFile := range allConfigFiles {
		vals, err := parseYAMLFields(configFile, allKeys)
		if err != nil || len(vals) == 0 {
			continue
		}
		data["config_found"] = true
		data["config_file"] = configFile

		batchKeySet := makeSet(batchingKeys)
		quantKeySet := makeSet(quantKeys)
		kvKeySet := makeSet(kvCacheKeys)
		mlopsKeySet := makeSet(mlopsKeys)

		batching := map[string]interface{}{}
		quant := map[string]interface{}{}
		kvcache := map[string]interface{}{}
		mlops := map[string]interface{}{}

		for k, v := range vals {
			switch {
			case batchKeySet[k]:
				batching[k] = parseNumOrBool(v)
			case quantKeySet[k]:
				quant[k] = parseNumOrBool(v)
			case kvKeySet[k]:
				kvcache[k] = parseNumOrBool(v)
			case mlopsKeySet[k]:
				mlops[k] = v
			}
		}

		if len(batching) > 0 {
			data["batching"] = batching
		}
		if len(quant) > 0 {
			data["quantization"] = quant
		}
		if len(kvcache) > 0 {
			data["kv_cache"] = kvcache
		}
		if len(mlops) > 0 {
			data["mlops"] = mlops
		}
		break
	}

	// Env var overrides
	servingEnvs := map[string]string{
		"QUANTIZATION":            "quantization",
		"GPU_MEMORY_UTILIZATION":  "gpu_memory_utilization",
		"MAX_NUM_SEQS":            "max_num_seqs",
		"MAX_MODEL_LEN":           "max_model_len",
		"ENABLE_PREFIX_CACHING":   "enable_prefix_caching",
	}
	envSettings := map[string]interface{}{}
	for envKey, fieldKey := range servingEnvs {
		if val := os.Getenv(envKey); val != "" {
			envSettings[fieldKey] = parseNumOrBool(val)
		}
	}
	if len(envSettings) > 0 {
		data["env_settings"] = envSettings
	}

	return &models.CollectedItem{
		SchemaName:    "ai.batching_config",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_serving_config",
		Category:      "ai",
		Data:          data,
	}, nil
}

// collectK8sGPUResources queries kubectl for GPU resource limits/requests and HPA config.
func (c *Collector) collectK8sGPUResources(ctx context.Context) (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"kubectl_available": false,
	}

	kubectlPath, err := exec.LookPath("kubectl")
	if err != nil {
		return &models.CollectedItem{
			SchemaName:    "ai.k8s_gpu_resources",
			SchemaVersion: "1.0.0",
			MetricType:    "ai_k8s_gpu",
			Category:      "ai",
			Data:          data,
		}, nil
	}
	data["kubectl_available"] = true
	data["kubectl_path"] = kubectlPath

	// Get pods with GPU resources
	out, err := exec.CommandContext(ctx, "kubectl", "get", "pods", "--all-namespaces",
		"-o", "jsonpath={range .items[*]}{.metadata.namespace}/{.metadata.name} {.spec.containers[*].resources.limits['nvidia\\.com/gpu']}{\"\\n\"}{end}",
	).Output()
	if err != nil {
		data["kubectl_error"] = fmt.Sprintf("kubectl get pods failed: %v", err)
		return &models.CollectedItem{
			SchemaName:    "ai.k8s_gpu_resources",
			SchemaVersion: "1.0.0",
			MetricType:    "ai_k8s_gpu",
			Category:      "ai",
			Data:          data,
		}, nil
	}

	gpuPods := []map[string]interface{}{}
	totalGPURequested := 0

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 1 {
			continue
		}
		podName := parts[0]
		gpuLimit := ""
		if len(parts) >= 2 {
			gpuLimit = parts[1]
		}
		if gpuLimit != "" && gpuLimit != "0" {
			if n, err := strconv.Atoi(gpuLimit); err == nil {
				totalGPURequested += n
			}
			gpuPods = append(gpuPods, map[string]interface{}{
				"pod":       podName,
				"gpu_limit": gpuLimit,
			})
		}
	}

	data["gpu_pods"] = gpuPods
	data["total_gpu_requested"] = totalGPURequested
	data["gpu_pod_count"] = len(gpuPods)

	// Try to get HPA info for GPU workloads
	hpaOut, err := exec.CommandContext(ctx, "kubectl", "get", "hpa", "--all-namespaces", "-o", "json").Output()
	if err == nil {
		var hpaJSON map[string]interface{}
		if err := json.Unmarshal(hpaOut, &hpaJSON); err == nil {
			if items, ok := hpaJSON["items"].([]interface{}); ok {
				hpaList := []map[string]interface{}{}
				for _, item := range items {
					if hpa, ok := item.(map[string]interface{}); ok {
						meta, _ := hpa["metadata"].(map[string]interface{})
						spec, _ := hpa["spec"].(map[string]interface{})
						if meta == nil || spec == nil {
							continue
						}
						entry := map[string]interface{}{
							"name":      fmt.Sprintf("%v/%v", meta["namespace"], meta["name"]),
							"min":       spec["minReplicas"],
							"max":       spec["maxReplicas"],
						}
						if status, ok := hpa["status"].(map[string]interface{}); ok {
							entry["current_replicas"] = status["currentReplicas"]
						}
						hpaList = append(hpaList, entry)
					}
				}
				if len(hpaList) > 0 {
					data["hpa"] = hpaList
				}
			}
		}
	}

	return &models.CollectedItem{
		SchemaName:    "ai.k8s_gpu_resources",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_k8s_gpu",
		Category:      "ai",
		Data:          data,
	}, nil
}

// --- helpers ---

func (c *Collector) pingHTTP(ctx context.Context, url string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode < 500
}

func isProcessRunning(name string) bool {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux", "darwin":
		cmd = exec.Command("pgrep", "-x", name)
	case "windows":
		cmd = exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq %s.exe", name), "/NH")
	default:
		return false
	}
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	output := strings.TrimSpace(string(out))
	return output != "" && !strings.Contains(output, "No tasks are running")
}

func parseYAMLFields(path string, keys []string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	keySet := makeSet(keys)
	result := map[string]string{}
	scanner := bufio.NewScanner(f)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") {
			continue
		}
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"'`)
		if keySet[key] && val != "" {
			result[key] = val
		}
	}
	return result, nil
}

func makeSet(keys []string) map[string]bool {
	s := make(map[string]bool, len(keys))
	for _, k := range keys {
		s[k] = true
	}
	return s
}

func parseNumOrBool(s string) interface{} {
	switch strings.ToLower(s) {
	case "true":
		return true
	case "false":
		return false
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return s
}
