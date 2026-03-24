package gpu_test

import (
	"context"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai/gpu"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// fakeDriver is a test double for the Driver interface.
type fakeDriver struct {
	vendor   gpu.Vendor
	detected bool
	metrics  []gpu.GPUMetric
	err      error
}

func (f *fakeDriver) Vendor() gpu.Vendor            { return f.vendor }
func (f *fakeDriver) Detect(_ context.Context) bool { return f.detected }
func (f *fakeDriver) Collect(_ context.Context) ([]gpu.GPUMetric, error) {
	return f.metrics, f.err
}

func TestRegistryActiveDrivers(t *testing.T) {
	nv := &fakeDriver{vendor: gpu.VendorNVIDIA, detected: true}
	amd := &fakeDriver{vendor: gpu.VendorAMD, detected: false}
	intel := &fakeDriver{vendor: gpu.VendorIntel, detected: true}

	reg := gpu.NewRegistry(nv, amd, intel)
	active := reg.ActiveDrivers(context.Background())

	if len(active) != 2 {
		t.Fatalf("expected 2 active drivers, got %d", len(active))
	}
	if active[0].Vendor() != gpu.VendorNVIDIA {
		t.Errorf("expected first active driver nvidia, got %s", active[0].Vendor())
	}
	if active[1].Vendor() != gpu.VendorIntel {
		t.Errorf("expected second active driver intel, got %s", active[1].Vendor())
	}
}

func TestRegistryCollectAll(t *testing.T) {
	nv := &fakeDriver{
		vendor:   gpu.VendorNVIDIA,
		detected: true,
		metrics: []gpu.GPUMetric{
			{Index: 0, Name: "A100", Vendor: gpu.VendorNVIDIA, VRAMTotalMB: 80 * 1024},
			{Index: 1, Name: "A100", Vendor: gpu.VendorNVIDIA, VRAMTotalMB: 80 * 1024},
		},
	}
	amdDrv := &fakeDriver{
		vendor:   gpu.VendorAMD,
		detected: true,
		metrics: []gpu.GPUMetric{
			{Index: 0, Name: "MI250", Vendor: gpu.VendorAMD, VRAMTotalMB: 128 * 1024},
		},
	}

	reg := gpu.NewRegistry(nv, amdDrv)
	metrics, errs := reg.CollectAll(context.Background())

	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	if len(metrics) != 3 {
		t.Fatalf("expected 3 metrics total, got %d", len(metrics))
	}
}

func TestRegistryCollectAllPartialError(t *testing.T) {
	good := &fakeDriver{
		vendor:   gpu.VendorNVIDIA,
		detected: true,
		metrics:  []gpu.GPUMetric{{Index: 0, Name: "H100", Vendor: gpu.VendorNVIDIA}},
	}
	bad := &fakeDriver{
		vendor:   gpu.VendorAMD,
		detected: true,
		err:      context.DeadlineExceeded,
	}

	reg := gpu.NewRegistry(good, bad)
	metrics, errs := reg.CollectAll(context.Background())

	if len(metrics) != 1 {
		t.Fatalf("expected 1 metric despite error, got %d", len(metrics))
	}
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
}

func TestCollectorAutoDetectNoPanic(t *testing.T) {
	c := gpu.New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect returned error: %v", err)
	}
	_ = result.Detected
}

func TestCollectorCollectNoPanic(t *testing.T) {
	c := gpu.New()
	cfg := models.CollectConfig{Hostname: "test-host"}
	result, err := c.Collect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect returned nil result")
	}
	if len(result.Items) == 0 {
		t.Fatal("Collect returned no items")
	}
	// Verify schema version
	if result.Items[0].SchemaVersion != "2.0.0" {
		t.Errorf("expected schema version 2.0.0, got %s", result.Items[0].SchemaVersion)
	}
}

func TestDetectVendorsNoPanic(t *testing.T) {
	vendors := gpu.DetectVendors(context.Background())
	for _, v := range vendors {
		switch v {
		case gpu.VendorNVIDIA, gpu.VendorAMD, gpu.VendorIntel, gpu.VendorApple:
			// valid vendor
		default:
			t.Errorf("unexpected vendor: %s", v)
		}
	}
}

func TestVendorConstants(t *testing.T) {
	cases := []struct {
		v    gpu.Vendor
		want string
	}{
		{gpu.VendorNVIDIA, "nvidia"},
		{gpu.VendorAMD, "amd"},
		{gpu.VendorIntel, "intel"},
		{gpu.VendorApple, "apple"},
		{gpu.VendorVirtual, "virtual"},
		{gpu.VendorUnknown, "unknown"},
	}
	for _, tc := range cases {
		if string(tc.v) != tc.want {
			t.Errorf("Vendor %q: expected %q", tc.v, tc.want)
		}
	}
}
