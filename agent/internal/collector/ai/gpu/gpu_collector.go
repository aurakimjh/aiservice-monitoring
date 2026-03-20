package gpu

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers GPU metrics via nvidia-smi.
type Collector struct{}

func New() *Collector {
	return &Collector{}
}

func (c *Collector) ID() string      { return "ai-gpu" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "exec", Target: "nvidia-smi", Description: "execute nvidia-smi for GPU metrics"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"ai.gpu_metrics.v1",
	}
}

func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	if runtime.GOOS == "windows" {
		return models.DetectResult{Detected: false}, nil
	}

	_, err := exec.LookPath("nvidia-smi")
	if err != nil {
		return models.DetectResult{
			Detected: false,
			Details:  map[string]string{"reason": "nvidia-smi not found"},
		}, nil
	}

	// Quick check: can we run nvidia-smi?
	out, err := exec.CommandContext(ctx, "nvidia-smi", "--query-gpu=name", "--format=csv,noheader").Output()
	if err != nil {
		return models.DetectResult{
			Detected: false,
			Details:  map[string]string{"reason": fmt.Sprintf("nvidia-smi failed: %v", err)},
		}, nil
	}

	gpuNames := strings.TrimSpace(string(out))
	return models.DetectResult{
		Detected: true,
		Details:  map[string]string{"gpus": gpuNames},
	}, nil
}

// GPUInfo holds metrics for a single GPU.
type GPUInfo struct {
	Index              int     `json:"index"`
	Name               string  `json:"name"`
	VRAMUsedMB         int     `json:"vram_used_mb"`
	VRAMTotalMB        int     `json:"vram_total_mb"`
	VRAMPercent        float64 `json:"vram_percent"`
	TemperatureC       int     `json:"temperature_c"`
	PowerDrawW         float64 `json:"power_draw_w"`
	SMUtilizationPct   int     `json:"sm_utilization_percent"`
	MemUtilizationPct  int     `json:"mem_utilization_percent"`
	ECCErrors          int     `json:"ecc_errors"`
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	// Run nvidia-smi with CSV output
	queryFields := "index,name,memory.used,memory.total,temperature.gpu,power.draw,utilization.gpu,utilization.memory,ecc.errors.corrected.aggregate.total"
	cmd := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu="+queryFields,
		"--format=csv,noheader,nounits",
	)

	out, err := cmd.Output()
	if err != nil {
		errMsg := fmt.Sprintf("nvidia-smi execution failed: %v", err)
		if exitErr, ok := err.(*exec.ExitError); ok {
			errMsg += fmt.Sprintf(" (stderr: %s)", string(exitErr.Stderr))
		}

		result.Status = models.StatusFailed
		result.Errors = append(result.Errors, models.CollectError{
			Code:       models.ErrPermissionDenied,
			Message:    errMsg,
			Command:    "nvidia-smi --query-gpu=... --format=csv,noheader,nounits",
			Required:   "exec:nvidia-smi (nvidia-utils package and video group membership)",
			Current:    fmt.Sprintf("command failed with: %v", err),
			Suggestion: "1) Install nvidia-utils: apt install nvidia-utils-535\n2) Add agent user to video group: usermod -aG video aitop-agent\n3) Or run agent as root",
		})
		result.Duration = time.Since(start)
		return result, nil
	}

	// Parse CSV output
	gpus := make([]GPUInfo, 0)
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")

	for _, line := range lines {
		fields := strings.Split(line, ", ")
		if len(fields) < 8 {
			continue
		}

		gpu := GPUInfo{}
		gpu.Index, _ = strconv.Atoi(strings.TrimSpace(fields[0]))
		gpu.Name = strings.TrimSpace(fields[1])
		gpu.VRAMUsedMB, _ = strconv.Atoi(strings.TrimSpace(fields[2]))
		gpu.VRAMTotalMB, _ = strconv.Atoi(strings.TrimSpace(fields[3]))
		gpu.TemperatureC, _ = strconv.Atoi(strings.TrimSpace(fields[4]))
		gpu.PowerDrawW, _ = strconv.ParseFloat(strings.TrimSpace(fields[5]), 64)
		gpu.SMUtilizationPct, _ = strconv.Atoi(strings.TrimSpace(fields[6]))
		gpu.MemUtilizationPct, _ = strconv.Atoi(strings.TrimSpace(fields[7]))
		if len(fields) > 8 {
			gpu.ECCErrors, _ = strconv.Atoi(strings.TrimSpace(fields[8]))
		}

		if gpu.VRAMTotalMB > 0 {
			gpu.VRAMPercent = float64(gpu.VRAMUsedMB) / float64(gpu.VRAMTotalMB) * 100
		}

		gpus = append(gpus, gpu)
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "ai.gpu_metrics",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_gpu_metrics",
		Category:      "ai",
		Data: map[string]interface{}{
			"gpu_count": len(gpus),
			"gpus":      gpus,
		},
	})

	result.Duration = time.Since(start)
	return result, nil
}
