package perfebpf

import "github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"

// perf/eBPF specific error codes.
const (
	ErrEBPFCapMissing        models.ErrorCode = "EBPF_CAP_MISSING"
	ErrEBPFKernelVersion     models.ErrorCode = "EBPF_KERNEL_VERSION"
	ErrPerfMapNotFound       models.ErrorCode = "PERF_MAP_NOT_FOUND"
	ErrSymbolUnknown         models.ErrorCode = "SYMBOL_UNKNOWN"
	ErrProfilingActive       models.ErrorCode = "PROFILING_ALREADY_ACTIVE"
	ErrDurationLimitExceeded models.ErrorCode = "DURATION_LIMIT_EXCEEDED"
)
