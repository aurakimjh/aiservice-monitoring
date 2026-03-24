package lite

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/buffer"
)

func TestBuildReportPDF_ValidPDF(t *testing.T) {
	now := time.Now()
	start := now.Add(-time.Hour)

	data := buildReportPDF("testhost", start, now, time.Hour, 42)

	if len(data) == 0 {
		t.Fatal("PDF data is empty")
	}
	if !strings.HasPrefix(string(data), "%PDF-1.4") {
		t.Errorf("missing %%PDF-1.4 header, got: %q", string(data[:min(len(data), 20)]))
	}
	if !strings.Contains(string(data), "%%EOF") {
		t.Error("PDF missing end-of-file marker")
	}
	if !strings.Contains(string(data), "testhost") {
		t.Error("hostname not found in PDF content stream")
	}
	if !strings.Contains(string(data), "xref") {
		t.Error("missing xref table")
	}
}

func TestBuildReportPDF_ZeroItems(t *testing.T) {
	data := buildReportPDF("h", time.Now(), time.Now(), 0, 0)
	if len(data) == 0 {
		t.Fatal("PDF data should not be empty for zero items")
	}
	if !strings.HasPrefix(string(data), "%PDF-1.4") {
		t.Error("missing %%PDF-1.4 header for zero-item report")
	}
}

func TestGeneratePDF(t *testing.T) {
	dir := t.TempDir()

	buf, err := buffer.Open(filepath.Join(dir, "buf.db"), slog.Default())
	if err != nil {
		t.Fatalf("buffer.Open: %v", err)
	}
	defer buf.Close()

	gen := NewReportGenerator(buf, slog.Default())
	path, err := gen.GeneratePDF(dir, time.Now().Add(-5*time.Minute))
	if err != nil {
		t.Fatalf("GeneratePDF: %v", err)
	}

	if !strings.HasSuffix(path, ".pdf") {
		t.Errorf("expected .pdf suffix, got: %s", filepath.Base(path))
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !strings.HasPrefix(string(raw), "%PDF-1.4") {
		t.Error("generated file is not a valid PDF")
	}
}

func TestPDFEscape(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"hello", "hello"},
		{"a(b)c", "a\\(b\\)c"},
		{"a\\b", "a\\\\b"},
		{"日本語", ""},         // non-ASCII dropped
		{"foo\x00bar", "foobar"}, // control chars dropped
	}
	for _, c := range cases {
		got := pdfEscape(c.in)
		if got != c.want {
			t.Errorf("pdfEscape(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
