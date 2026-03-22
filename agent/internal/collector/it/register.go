// Package it provides a registration helper for all IT infrastructure collectors.
package it

import (
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/db"
	oscol "github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/os"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/was"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/web"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/core"
)

// RegisterAll registers all IT infrastructure collectors into the given registry.
func RegisterAll(reg *core.Registry) {
	reg.Register(oscol.New())
	reg.Register(web.New())
	reg.Register(was.New())
	reg.Register(db.New())
}
