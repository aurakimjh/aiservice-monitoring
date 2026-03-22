package output_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/output"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func makeResult(status models.CollectStatus, items []models.CollectedItem, errs []models.CollectError) *models.CollectResult {
	return &models.CollectResult{
		CollectorID:      "test-collector",
		CollectorVersion: "1.0.0",
		Timestamp:        time.Date(2026, 3, 22, 0, 0, 0, 0, time.UTC),
		Status:           status,
		Items:            items,
		Errors:           errs,
	}
}

func parseLines(t *testing.T, buf *bytes.Buffer) []output.Record {
	t.Helper()
	var records []output.Record
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var rec output.Record
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			t.Fatalf("failed to parse NDJSON line %q: %v", line, err)
		}
		records = append(records, rec)
	}
	return records
}

func TestWriter_SuccessResult_OneLinePerItem(t *testing.T) {
	items := []models.CollectedItem{
		{SchemaName: "os.cpu_metrics", SchemaVersion: "1.0.0", Data: map[string]interface{}{"usage": 42.5}},
		{SchemaName: "os.memory_metrics", SchemaVersion: "1.0.0", Data: map[string]interface{}{"total_kb": 8192000}},
	}
	result := makeResult(models.StatusSuccess, items, nil)

	var buf bytes.Buffer
	w := output.NewWriter(&buf)
	if err := w.WriteResult(result, "agent-01", "host-01", "proj-01", "tenant-01"); err != nil {
		t.Fatalf("WriteResult() error: %v", err)
	}

	records := parseLines(t, &buf)
	if len(records) != 2 {
		t.Errorf("expected 2 NDJSON lines, got %d", len(records))
	}

	// Verify first record
	r := records[0]
	if r.SchemaName != "os.cpu_metrics" {
		t.Errorf("SchemaName = %q, want 'os.cpu_metrics'", r.SchemaName)
	}
	if r.CollectorID != "test-collector" {
		t.Errorf("CollectorID = %q, want 'test-collector'", r.CollectorID)
	}
	if r.AgentID != "agent-01" {
		t.Errorf("AgentID = %q, want 'agent-01'", r.AgentID)
	}
	if r.CollectStatus != models.StatusSuccess {
		t.Errorf("CollectStatus = %q, want SUCCESS", r.CollectStatus)
	}
	if len(r.Errors) != 0 {
		t.Errorf("expected empty errors slice, got %d errors", len(r.Errors))
	}
}

func TestWriter_FailedResult_EmitsSingleErrorRecord(t *testing.T) {
	errs := []models.CollectError{
		{
			Code:       models.ErrPermissionDenied,
			Message:    "cannot read /proc/diskstats",
			Command:    "read /proc/diskstats",
			Required:   "read:/proc",
			Current:    "permission denied",
			Suggestion: "grant read access to /proc",
		},
	}
	result := makeResult(models.StatusFailed, nil, errs)

	var buf bytes.Buffer
	w := output.NewWriter(&buf)
	if err := w.WriteResult(result, "agent-02", "host-02", "", ""); err != nil {
		t.Fatalf("WriteResult() error: %v", err)
	}

	records := parseLines(t, &buf)
	if len(records) != 1 {
		t.Errorf("expected 1 sentinel error record, got %d", len(records))
	}

	r := records[0]
	if r.CollectStatus != models.StatusFailed {
		t.Errorf("CollectStatus = %q, want FAILED", r.CollectStatus)
	}
	if len(r.Errors) == 0 {
		t.Fatal("expected at least one error in record")
	}
	if r.Errors[0].Code != models.ErrPermissionDenied {
		t.Errorf("error code = %q, want PERMISSION_DENIED", r.Errors[0].Code)
	}
	if r.Data != nil {
		t.Error("data must be nil for failed-only records")
	}
}

func TestWriter_PartialResult_EmitsItemsAndErrors(t *testing.T) {
	items := []models.CollectedItem{
		{SchemaName: "os.cpu_metrics", SchemaVersion: "1.0.0", Data: map[string]interface{}{}},
	}
	errs := []models.CollectError{
		{Code: models.ErrPermissionDenied, Message: "disk read failed"},
	}
	result := makeResult(models.StatusPartial, items, errs)

	var buf bytes.Buffer
	w := output.NewWriter(&buf)
	if err := w.WriteResult(result, "agent-03", "host-03", "proj", "t"); err != nil {
		t.Fatalf("WriteResult() error: %v", err)
	}

	records := parseLines(t, &buf)
	if len(records) != 1 {
		t.Errorf("expected 1 record for partial result, got %d", len(records))
	}
	r := records[0]
	if r.CollectStatus != models.StatusPartial {
		t.Errorf("CollectStatus = %q, want PARTIAL", r.CollectStatus)
	}
	// Errors are embedded even in partial records
	if len(r.Errors) == 0 {
		t.Error("partial record should carry errors")
	}
}

func TestWriter_ErrorCode_AllVariants(t *testing.T) {
	codes := []models.ErrorCode{
		models.ErrPermissionDenied,
		models.ErrNotInstalled,
		models.ErrTimeout,
		models.ErrConnectionRefused,
		models.ErrAuthFailed,
		models.ErrParseError,
		models.ErrEnvNotDetected,
		models.ErrQuarantined,
	}

	for _, code := range codes {
		t.Run(string(code), func(t *testing.T) {
			result := makeResult(models.StatusFailed, nil, []models.CollectError{
				{Code: code, Message: "error: " + string(code)},
			})

			var buf bytes.Buffer
			w := output.NewWriter(&buf)
			if err := w.WriteResult(result, "ag", "h", "", ""); err != nil {
				t.Fatalf("WriteResult() error: %v", err)
			}

			records := parseLines(t, &buf)
			if len(records) == 0 {
				t.Fatal("no records emitted")
			}
			if records[0].Errors[0].Code != code {
				t.Errorf("expected code %q, got %q", code, records[0].Errors[0].Code)
			}
		})
	}
}

func TestWriter_RecordFields_ArePresent(t *testing.T) {
	items := []models.CollectedItem{
		{
			SchemaName:    "os.system_info",
			SchemaVersion: "1.0.0",
			MetricType:    "os_system_info",
			Category:      "it",
			Data:          map[string]interface{}{"os": "linux"},
		},
	}
	result := makeResult(models.StatusSuccess, items, nil)

	var buf bytes.Buffer
	w := output.NewWriter(&buf)
	_ = w.WriteResult(result, "agent-99", "myhost", "proj-x", "tenant-y")

	records := parseLines(t, &buf)
	if len(records) == 0 {
		t.Fatal("no records")
	}
	r := records[0]

	checks := map[string]bool{
		"schema_name":       r.SchemaName != "",
		"schema_version":    r.SchemaVersion != "",
		"collector_type":    r.CollectorType != "",
		"collector_id":      r.CollectorID != "",
		"collector_version": r.CollectorVersion != "",
		"agent_id":          r.AgentID != "",
		"hostname":          r.Hostname != "",
		"project_id":        r.ProjectID != "",
		"tenant_id":         r.TenantID != "",
		"collect_status":    r.CollectStatus != "",
	}
	for field, ok := range checks {
		if !ok {
			t.Errorf("required NDJSON field %q is missing or empty", field)
		}
	}
}

func TestWriter_WriteError_EmitsSingleLine(t *testing.T) {
	var buf bytes.Buffer
	w := output.NewWriter(&buf)
	err := w.WriteError("os", "agent.collection_error", "agent-01", "host-01",
		models.ErrPermissionDenied, "test permission denied")
	if err != nil {
		t.Fatalf("WriteError() error: %v", err)
	}

	records := parseLines(t, &buf)
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	r := records[0]
	if r.CollectStatus != models.StatusFailed {
		t.Errorf("CollectStatus = %q, want FAILED", r.CollectStatus)
	}
	if r.Errors[0].Code != models.ErrPermissionDenied {
		t.Errorf("code = %q, want PERMISSION_DENIED", r.Errors[0].Code)
	}
}
