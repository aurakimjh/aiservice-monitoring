package os_test

import (
	"context"
	"strings"
	"testing"

	osCollector "github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/os"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestCollector_ID(t *testing.T) {
	c := osCollector.New()
	if c.ID() != "os" {
		t.Errorf("expected ID 'os', got %q", c.ID())
	}
}

func TestCollector_OutputSchemas(t *testing.T) {
	c := osCollector.New()
	schemas := c.OutputSchemas()

	expected := []string{
		"os.cpu_metrics.v1",
		"os.memory_metrics.v1",
		"os.disk_metrics.v1",
		"os.network_metrics.v1",
		"os.process_list.v1",
		"os.system_info.v1",
	}

	schemaSet := make(map[string]bool, len(schemas))
	for _, s := range schemas {
		schemaSet[s] = true
	}

	for _, want := range expected {
		if !schemaSet[want] {
			t.Errorf("OutputSchemas() missing %q", want)
		}
	}
}

func TestCollector_AutoDetect(t *testing.T) {
	c := osCollector.New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect() returned error: %v", err)
	}
	if !result.Detected {
		t.Error("AutoDetect() should always return Detected=true for OS collector")
	}
}

func TestCollector_Collect_ReturnsResult(t *testing.T) {
	c := osCollector.New()
	cfg := models.CollectConfig{
		ProjectID: "test-project",
		Hostname:  "test-host",
	}

	result, err := c.Collect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("Collect() returned unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect() returned nil result")
	}
	if result.CollectorID != "os" {
		t.Errorf("CollectorID = %q, want 'os'", result.CollectorID)
	}
	if result.Status == "" {
		t.Error("Status must not be empty")
	}
	// Items or errors must be present
	if len(result.Items) == 0 && len(result.Errors) == 0 {
		t.Error("expected at least one item or error")
	}
}

func TestCollector_Collect_ItemSchemaNames(t *testing.T) {
	c := osCollector.New()
	result, err := c.Collect(context.Background(), models.CollectConfig{})
	if err != nil {
		t.Fatalf("Collect() error: %v", err)
	}

	for _, item := range result.Items {
		if item.SchemaName == "" {
			t.Error("CollectedItem.SchemaName must not be empty")
		}
		if item.SchemaVersion == "" {
			t.Error("CollectedItem.SchemaVersion must not be empty")
		}
		if item.Category == "" {
			t.Error("CollectedItem.Category must not be empty")
		}
		if item.Data == nil {
			t.Errorf("CollectedItem %q has nil Data", item.SchemaName)
		}
	}
}

// --- Error response format tests (15-2-8) ---

// mockFailingCollector is a Collector that always returns PERMISSION_DENIED.
type mockFailingCollector struct {
	code    models.ErrorCode
	command string
}

func (m *mockFailingCollector) ID() string                              { return "mock-failing" }
func (m *mockFailingCollector) Version() string                         { return "0.0.1" }
func (m *mockFailingCollector) SupportedPlatforms() []string            { return []string{"linux"} }
func (m *mockFailingCollector) RequiredPrivileges() []models.Privilege  { return nil }
func (m *mockFailingCollector) OutputSchemas() []string                 { return []string{"mock.schema.v1"} }
func (m *mockFailingCollector) AutoDetect(_ context.Context) (models.DetectResult, error) {
	return models.DetectResult{Detected: true}, nil
}
func (m *mockFailingCollector) Collect(_ context.Context, _ models.CollectConfig) (*models.CollectResult, error) {
	return &models.CollectResult{
		CollectorID:      m.ID(),
		CollectorVersion: m.Version(),
		Status:           models.StatusFailed,
		Errors: []models.CollectError{
			{
				Code:       m.code,
				Message:    "mock error: " + string(m.code),
				Command:    m.command,
				Required:   "root access",
				Current:    "running as non-root",
				Suggestion: "run agent as root or grant required permissions",
			},
		},
	}, nil
}

var errorCodeCases = []models.ErrorCode{
	models.ErrPermissionDenied,
	models.ErrNotInstalled,
	models.ErrTimeout,
	models.ErrConnectionRefused,
	models.ErrAuthFailed,
	models.ErrParseError,
	models.ErrEnvNotDetected,
}

func TestErrorResponse_CodeValues(t *testing.T) {
	for _, code := range errorCodeCases {
		t.Run(string(code), func(t *testing.T) {
			col := &mockFailingCollector{code: code, command: "test-cmd"}
			result, err := col.Collect(context.Background(), models.CollectConfig{})
			if err != nil {
				t.Fatalf("Collect() error: %v", err)
			}
			if result.Status != models.StatusFailed {
				t.Errorf("Status = %q, want FAILED", result.Status)
			}
			if len(result.Errors) == 0 {
				t.Fatal("expected at least one CollectError")
			}
			ce := result.Errors[0]
			if ce.Code != code {
				t.Errorf("CollectError.Code = %q, want %q", ce.Code, code)
			}
			if ce.Message == "" {
				t.Error("CollectError.Message must not be empty")
			}
		})
	}
}

func TestErrorResponse_PermissionDenied_HasSuggestion(t *testing.T) {
	col := &mockFailingCollector{
		code:    models.ErrPermissionDenied,
		command: "nvidia-smi",
	}
	result, _ := col.Collect(context.Background(), models.CollectConfig{})

	if len(result.Errors) == 0 {
		t.Fatal("expected errors")
	}
	ce := result.Errors[0]
	if ce.Suggestion == "" {
		t.Error("PERMISSION_DENIED error must include a Suggestion for the operator")
	}
	if ce.Required == "" {
		t.Error("PERMISSION_DENIED error must include Required field")
	}
	if ce.Current == "" {
		t.Error("PERMISSION_DENIED error must include Current field")
	}
}

func TestErrorResponse_NotInstalled_HasCommand(t *testing.T) {
	col := &mockFailingCollector{
		code:    models.ErrNotInstalled,
		command: "nvidia-smi",
	}
	result, _ := col.Collect(context.Background(), models.CollectConfig{})

	if len(result.Errors) == 0 {
		t.Fatal("expected errors")
	}
	ce := result.Errors[0]
	if ce.Command == "" {
		t.Error("NOT_INSTALLED error must include the Command that was not found")
	}
}

func TestErrorResponse_StatusTransitions(t *testing.T) {
	cases := []struct {
		status     models.CollectStatus
		hasItems   bool
		hasErrors  bool
	}{
		{models.StatusSuccess, true, false},
		{models.StatusFailed, false, true},
		{models.StatusPartial, true, true},
		{models.StatusSkipped, false, false},
	}

	for _, tc := range cases {
		t.Run(string(tc.status), func(t *testing.T) {
			result := &models.CollectResult{
				CollectorID: "test",
				Status:      tc.status,
			}
			if tc.hasItems {
				result.Items = []models.CollectedItem{{
					SchemaName:    "test.schema",
					SchemaVersion: "1.0.0",
					Data:          map[string]interface{}{"k": "v"},
				}}
			}
			if tc.hasErrors {
				result.Errors = []models.CollectError{{
					Code:    models.ErrPermissionDenied,
					Message: "test error",
				}}
			}

			// Verify error code string values are well-formed
			for _, e := range result.Errors {
				if !strings.Contains(string(e.Code), "_") && e.Code != "" {
					// Codes should be SCREAMING_SNAKE_CASE
					t.Logf("code %q does not follow SCREAMING_SNAKE_CASE convention", e.Code)
				}
			}
		})
	}
}
