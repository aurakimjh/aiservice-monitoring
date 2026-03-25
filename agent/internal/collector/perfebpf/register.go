package perfebpf

import "github.com/aurakimjh/aiservice-monitoring/agent/internal/core"

// RegisterAll registers the perf/eBPF collector into the given registry.
func RegisterAll(reg *core.Registry) {
	reg.Register(New())
}
