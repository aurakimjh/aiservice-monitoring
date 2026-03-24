//go:build !darwin

package gpu

import "context"

// appleDriver is a no-op on non-Apple platforms.
type appleDriver struct{}

func newAppleDriver() Driver                         { return &appleDriver{} }
func (d *appleDriver) Vendor() Vendor                { return VendorApple }
func (d *appleDriver) Detect(_ context.Context) bool { return false }
func (d *appleDriver) Collect(_ context.Context) ([]GPUMetric, error) {
	return nil, nil
}
