package gpu

import (
	"context"
	"fmt"
	"sync"
)

// Registry holds GPU drivers and collects from all active ones.
type Registry struct {
	mu      sync.Mutex
	drivers []Driver
}

// NewRegistry creates a new driver registry with the given drivers.
func NewRegistry(drivers ...Driver) *Registry {
	return &Registry{drivers: drivers}
}

// ActiveDrivers returns only drivers whose Detect() returns true.
func (r *Registry) ActiveDrivers(ctx context.Context) []Driver {
	r.mu.Lock()
	defer r.mu.Unlock()

	var active []Driver
	for _, d := range r.drivers {
		if d.Detect(ctx) {
			active = append(active, d)
		}
	}
	return active
}

// CollectAll collects metrics from all active drivers.
func (r *Registry) CollectAll(ctx context.Context) ([]GPUMetric, []error) {
	active := r.ActiveDrivers(ctx)
	var (
		metrics []GPUMetric
		errs    []error
	)
	for _, d := range active {
		m, err := d.Collect(ctx)
		if err != nil {
			errs = append(errs, fmt.Errorf("[%s] %w", d.Vendor(), err))
			continue
		}
		metrics = append(metrics, m...)
	}
	return metrics, errs
}
