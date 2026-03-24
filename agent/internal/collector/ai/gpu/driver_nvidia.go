package gpu

// nvidiaDriver implements GPU metrics collection for NVIDIA GPUs via nvidia-smi.
// It provides MIG and vGPU enrichment when available.
//
// # go-nvml note
// Full go-nvml (NVML C library) bindings require CGO and the NVIDIA driver at
// build time.  This implementation uses the nvidia-smi CLI which calls the same
// NVML API internally — providing identical metrics without build-time
// dependencies.  The driver interface allows a future drop-in go-nvml backend.

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

type nvidiaDriver struct{}

func newNVIDIADriver() Driver { return &nvidiaDriver{} }

func (d *nvidiaDriver) Vendor() Vendor { return VendorNVIDIA }

func (d *nvidiaDriver) Detect(ctx context.Context) bool {
	if runtime.GOOS == "darwin" {
		return false
	}
	if _, err := os.Stat("/dev/nvidia0"); err == nil {
		return true
	}
	if _, err := os.Stat("/proc/driver/nvidia"); err == nil {
		return true
	}
	if _, err := exec.LookPath("nvidia-smi"); err != nil {
		return false
	}
	out, err := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu=name", "--format=csv,noheader").Output()
	return err == nil && len(strings.TrimSpace(string(out))) > 0
}

func (d *nvidiaDriver) Collect(ctx context.Context) ([]GPUMetric, error) {
	metrics, err := d.collectViaSMI(ctx)
	if err != nil {
		return nil, err
	}
	d.enrichMIG(ctx, metrics)
	d.enrichVGPU(ctx, metrics)
	return metrics, nil
}

func (d *nvidiaDriver) collectViaSMI(ctx context.Context) ([]GPUMetric, error) {
	const queryFields = "index,name,memory.used,memory.total,temperature.gpu," +
		"power.draw,utilization.gpu,utilization.memory,pci.bus_id,driver_version"
	out, err := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu="+queryFields, "--format=csv,noheader,nounits").Output()
	if err != nil {
		msg := ""
		if ee, ok := err.(*exec.ExitError); ok {
			msg = " stderr=" + string(ee.Stderr)
		}
		return nil, fmt.Errorf("nvidia-smi query failed: %w%s", err, msg)
	}

	var metrics []GPUMetric
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		m := parseNvidiaSMILine(line)
		if m != nil {
			metrics = append(metrics, *m)
		}
	}
	return metrics, nil
}

func parseNvidiaSMILine(line string) *GPUMetric {
	fields := strings.Split(line, ", ")
	if len(fields) < 8 {
		return nil
	}
	tr := strings.TrimSpace

	idx, _ := strconv.Atoi(tr(fields[0]))
	vramUsed, _ := strconv.ParseInt(tr(fields[2]), 10, 64)
	vramTotal, _ := strconv.ParseInt(tr(fields[3]), 10, 64)
	temp, _ := strconv.ParseFloat(tr(fields[4]), 64)
	power, _ := strconv.ParseFloat(tr(fields[5]), 64)
	coreUtil, _ := strconv.ParseFloat(tr(fields[6]), 64)
	memUtil, _ := strconv.ParseFloat(tr(fields[7]), 64)

	var pciID, driverVer string
	if len(fields) > 8 {
		pciID = tr(fields[8])
	}
	if len(fields) > 9 {
		driverVer = tr(fields[9])
	}

	var vramPct float64
	if vramTotal > 0 {
		vramPct = float64(vramUsed) / float64(vramTotal) * 100
	}
	return &GPUMetric{
		Index:         idx,
		Name:          tr(fields[1]),
		Vendor:        VendorNVIDIA,
		VRAMUsedMB:    vramUsed,
		VRAMTotalMB:   vramTotal,
		VRAMPercent:   vramPct,
		TemperatureC:  temp,
		PowerDrawW:    power,
		CoreUtilPct:   coreUtil,
		MemUtilPct:    memUtil,
		PCIID:         pciID,
		DriverVersion: driverVer,
	}
}

func (d *nvidiaDriver) enrichMIG(ctx context.Context, metrics []GPUMetric) {
	out, err := exec.CommandContext(ctx, "nvidia-smi", "-L").Output()
	if err != nil {
		return
	}
	for i := range metrics {
		prefix := fmt.Sprintf("GPU %d:", metrics[i].Index)
		for _, line := range strings.Split(string(out), "\n") {
			if strings.HasPrefix(line, prefix) && strings.Contains(line, "MIG") {
				metrics[i].MIGEnabled = true
				if start := strings.Index(line, "("); start >= 0 {
					metrics[i].MIGInstance = strings.TrimSpace(line[start:])
				}
				break
			}
		}
	}
}

func (d *nvidiaDriver) enrichVGPU(ctx context.Context, metrics []GPUMetric) {
	out, err := exec.CommandContext(ctx, "nvidia-smi", "vgpu", "-q").Output()
	if err != nil || !strings.Contains(string(out), "vGPU") {
		return
	}
	for i := range metrics {
		if strings.Contains(string(out), fmt.Sprintf("GPU %02d", metrics[i].Index)) {
			metrics[i].IsVirtual = true
			if metrics[i].Extra == nil {
				metrics[i].Extra = make(map[string]string)
			}
			metrics[i].Extra["vgpu"] = "grid"
		}
	}
}
