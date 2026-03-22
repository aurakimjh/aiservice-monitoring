// Package ai provides a registration helper for all AI collectors.
package ai

import (
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai/gpu"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai/llm"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai/otel"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai/serving"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai/vectordb"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/core"
)

// RegisterAll registers all AI collectors into the given registry.
func RegisterAll(reg *core.Registry) {
	reg.Register(gpu.New())
	reg.Register(llm.New())
	reg.Register(vectordb.New())
	reg.Register(serving.New())
	reg.Register(otel.New())
}
