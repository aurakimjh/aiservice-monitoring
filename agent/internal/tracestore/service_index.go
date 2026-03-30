package tracestore

import (
	"sort"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

// ServiceIndex maintains a live catalogue of all observed services and the
// call-dependency graph extracted from parent-child span relationships.
//
// Dependency extraction logic:
//   A "dependency edge" A → B exists when a span in service B has a parent
//   span that belongs to service A.  The engine observes this from the
//   ParentID field: when a span has a parent we look up the parent in the
//   hot-tier ring buffer; if the parent is from a different service we record
//   the edge.
//
// The index is updated on every Ingest call and is safe for concurrent use.
type ServiceIndex struct {
	mu sync.RWMutex

	// services maps serviceName → ServiceInfo
	services map[string]*ServiceInfo

	// spanService maps spanID → serviceName for parent-lookup in the same batch.
	// This is a write-through cache limited to the last spanCacheSize entries.
	spanService   map[string]string
	spanCacheSize int
}

// ServiceInfo describes a single observed service.
type ServiceInfo struct {
	Name        string    `json:"name"`
	FirstSeen   time.Time `json:"firstSeen"`
	LastSeen    time.Time `json:"lastSeen"`
	SpanCount   int64     `json:"spanCount"`
	ErrorCount  int64     `json:"errorCount"`
	// Upstream lists services that call this service (inbound edges).
	Upstream []string `json:"upstream,omitempty"`
	// Downstream lists services this service calls (outbound edges).
	Downstream []string `json:"downstream,omitempty"`
}

// DependencyEdge is one directed edge in the service dependency graph.
type DependencyEdge struct {
	Caller string `json:"caller"`
	Callee string `json:"callee"`
	Count  int64  `json:"count"` // observed call count
}

// NewServiceIndex creates a ready-to-use ServiceIndex.
func NewServiceIndex() *ServiceIndex {
	return &ServiceIndex{
		services:      make(map[string]*ServiceInfo),
		spanService:   make(map[string]string),
		spanCacheSize: 200_000,
	}
}

// Ingest processes a batch of spans and updates the index.
// It is called by the Store on every write.
func (si *ServiceIndex) Ingest(spans []*otlp.Span) {
	if len(spans) == 0 {
		return
	}

	si.mu.Lock()
	defer si.mu.Unlock()

	now := time.Now().UTC()

	// First pass: register all spans in the local cache so intra-batch
	// parent lookups work even when spans arrive out of order.
	for _, s := range spans {
		si.spanService[s.SpanID] = s.ServiceName
	}

	// Second pass: update service metadata and dependency edges.
	for _, s := range spans {
		svc, ok := si.services[s.ServiceName]
		if !ok {
			svc = &ServiceInfo{
				Name:      s.ServiceName,
				FirstSeen: s.StartTime,
			}
			si.services[s.ServiceName] = svc
		}
		svc.LastSeen = now
		svc.SpanCount++
		if s.IsError() {
			svc.ErrorCount++
		}

		// Parent-lookup: if the parent span belongs to a different service,
		// record a caller→callee dependency edge.
		if s.ParentID != "" {
			if parentSvc, found := si.spanService[s.ParentID]; found && parentSvc != s.ServiceName {
				si.addEdgeLocked(parentSvc, s.ServiceName)
			}
		}
	}

	// Evict span cache entries when over capacity (simple truncation; the
	// oldest entries are not tracked but approximate LRU is fine here).
	if len(si.spanService) > si.spanCacheSize {
		// Rebuild with only the most recent batch's span IDs to reclaim memory.
		fresh := make(map[string]string, len(spans))
		for _, s := range spans {
			fresh[s.SpanID] = s.ServiceName
		}
		si.spanService = fresh
	}
}

// addEdgeLocked updates the upstream/downstream sets for caller and callee.
// Must be called with si.mu held.
func (si *ServiceIndex) addEdgeLocked(caller, callee string) {
	// Ensure callee knows about its upstream.
	calleeInfo, ok := si.services[callee]
	if !ok {
		calleeInfo = &ServiceInfo{Name: callee}
		si.services[callee] = calleeInfo
	}
	if !containsStr(calleeInfo.Upstream, caller) {
		calleeInfo.Upstream = append(calleeInfo.Upstream, caller)
	}

	// Ensure caller knows about its downstream.
	callerInfo, ok := si.services[caller]
	if !ok {
		callerInfo = &ServiceInfo{Name: caller}
		si.services[caller] = callerInfo
	}
	if !containsStr(callerInfo.Downstream, callee) {
		callerInfo.Downstream = append(callerInfo.Downstream, callee)
	}
}

// Services returns a snapshot of all known services sorted by name.
func (si *ServiceIndex) Services() []*ServiceInfo {
	si.mu.RLock()
	defer si.mu.RUnlock()

	out := make([]*ServiceInfo, 0, len(si.services))
	for _, svc := range si.services {
		cp := *svc // shallow copy is enough (slices are read-only after snapshot)
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// ServiceNames returns the sorted list of all observed service names.
func (si *ServiceIndex) ServiceNames() []string {
	si.mu.RLock()
	defer si.mu.RUnlock()

	names := make([]string, 0, len(si.services))
	for name := range si.services {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// DependencyGraph returns all observed dependency edges.
func (si *ServiceIndex) DependencyGraph() []DependencyEdge {
	si.mu.RLock()
	defer si.mu.RUnlock()

	// Build edge set (deduplicated).
	type edgeKey struct{ caller, callee string }
	counts := make(map[edgeKey]int64)

	for _, svc := range si.services {
		for _, downstream := range svc.Downstream {
			counts[edgeKey{svc.Name, downstream}]++
		}
	}

	edges := make([]DependencyEdge, 0, len(counts))
	for k, c := range counts {
		edges = append(edges, DependencyEdge{Caller: k.caller, Callee: k.callee, Count: c})
	}
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].Caller != edges[j].Caller {
			return edges[i].Caller < edges[j].Caller
		}
		return edges[i].Callee < edges[j].Callee
	})
	return edges
}

// GetService returns the ServiceInfo for a given name (nil if unknown).
func (si *ServiceIndex) GetService(name string) *ServiceInfo {
	si.mu.RLock()
	defer si.mu.RUnlock()
	if svc, ok := si.services[name]; ok {
		cp := *svc
		return &cp
	}
	return nil
}

func containsStr(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}
