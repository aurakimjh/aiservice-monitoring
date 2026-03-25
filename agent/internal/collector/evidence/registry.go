package evidence

import (
	"fmt"
	"sync"
)

// Registry holds all registered EvidenceCollectors.
type Registry struct {
	mu         sync.RWMutex
	collectors map[string]EvidenceCollector
}

// NewRegistry creates an empty Registry.
func NewRegistry() *Registry {
	return &Registry{collectors: make(map[string]EvidenceCollector)}
}

// Register adds an EvidenceCollector. Panics on duplicate ID.
func (r *Registry) Register(c EvidenceCollector) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.collectors[c.ID()]; exists {
		panic(fmt.Sprintf("evidence registry: duplicate collector ID %q", c.ID()))
	}
	r.collectors[c.ID()] = c
}

// Get returns the collector by ID.
func (r *Registry) Get(id string) (EvidenceCollector, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.collectors[id]
	return c, ok
}

// List returns all registered collector IDs.
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0, len(r.collectors))
	for id := range r.collectors {
		ids = append(ids, id)
	}
	return ids
}

// All returns all registered collectors.
func (r *Registry) All() []EvidenceCollector {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]EvidenceCollector, 0, len(r.collectors))
	for _, c := range r.collectors {
		out = append(out, c)
	}
	return out
}

// ByMode returns collectors filtered by CollectMode.
func (r *Registry) ByMode(mode CollectMode) []EvidenceCollector {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var out []EvidenceCollector
	for _, c := range r.collectors {
		if c.Mode() == mode {
			out = append(out, c)
		}
	}
	return out
}

// DefaultRegistry is the package-level registry pre-populated with all
// built-in evidence collectors.
var DefaultRegistry = buildDefaultRegistry()

func buildDefaultRegistry() *Registry {
	reg := NewRegistry()
	reg.Register(NewConfigEvidenceCollector())
	reg.Register(NewLogEvidenceCollector())
	reg.Register(NewEOSEvidenceCollector())
	reg.Register(NewBuiltinItemsCollector())
	reg.Register(NewSecurityEvidenceCollector())
	reg.Register(NewAPMEvidenceCollector())
	reg.Register(NewCrossAnalysisCollector())
	return reg
}
