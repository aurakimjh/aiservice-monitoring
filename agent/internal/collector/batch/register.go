package batch

import (
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/core"
)

// RegisterAll registers the batch process collector into the given registry.
func RegisterAll(reg *core.Registry) {
	reg.Register(New())
}
