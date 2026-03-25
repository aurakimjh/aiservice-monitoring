package evidence

import (
	"context"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// CollectorAdapter wraps an existing models.Collector and exposes its
// CollectResult output as an EvidenceResult. This allows the 12 IT/AI
// Collectors (os/web/was/db/cache/mq/gpu/ai/…) to contribute to the
// diagnostic evidence bundle without code changes (Phase 31-1f).
type CollectorAdapter struct {
	inner models.Collector
}

// NewCollectorAdapter wraps a models.Collector as an EvidenceCollector.
func NewCollectorAdapter(c models.Collector) EvidenceCollector {
	return &CollectorAdapter{inner: c}
}

func (a *CollectorAdapter) ID() string        { return "evidence-adapter-" + a.inner.ID() }
func (a *CollectorAdapter) Version() string   { return a.inner.Version() }
func (a *CollectorAdapter) Category() string  { return "collector-adapter" }
func (a *CollectorAdapter) Mode() CollectMode { return ModeBuiltin }
func (a *CollectorAdapter) CoveredItems() []string {
	// Adapters cover the output schemas of the wrapped collector.
	return a.inner.OutputSchemas()
}

// Collect runs the wrapped collector and converts its CollectResult into an
// EvidenceResult. Each CollectedItem becomes one EvidenceItem.
func (a *CollectorAdapter) Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error) {
	collectCfg := models.CollectConfig{
		Hostname:  cfg.Hostname,
		ProjectID: cfg.ProjectID,
		TenantID:  cfg.TenantID,
	}

	cr, err := a.inner.Collect(ctx, collectCfg)
	if err != nil {
		return nil, err
	}

	res := &EvidenceResult{
		CollectorID:      a.ID(),
		CollectorVersion: a.Version(),
		CollectMode:      ModeBuiltin,
		AgentID:          cfg.AgentID,
		Hostname:         cfg.Hostname,
		Timestamp:        time.Now().UTC(),
	}

	for _, item := range cr.Items {
		res.Items = append(res.Items, EvidenceItem{
			SchemaName:  item.SchemaName + "_evidence",
			Content:     item.Data,
			CollectedAt: cr.Timestamp,
		})
	}
	for _, e := range cr.Errors {
		res.Errors = append(res.Errors, EvidenceError{
			Code:    string(e.Code),
			Message: e.Message,
			Source:  e.Command,
		})
	}
	return res, nil
}

// AdapterRegistry holds CollectorAdapters built from existing collectors.
type AdapterRegistry struct {
	adapters []EvidenceCollector
}

// NewAdapterRegistry wraps all provided collectors as evidence adapters.
func NewAdapterRegistry(collectors []models.Collector) *AdapterRegistry {
	ar := &AdapterRegistry{}
	for _, c := range collectors {
		ar.adapters = append(ar.adapters, NewCollectorAdapter(c))
	}
	return ar
}

// All returns all adapter evidence collectors.
func (ar *AdapterRegistry) All() []EvidenceCollector {
	return ar.adapters
}
