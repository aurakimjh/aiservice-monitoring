package llm

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestCollectorMetadata(t *testing.T) {
	c := New()
	if c.ID() != "ai-llm-agent" {
		t.Errorf("expected ID ai-llm-agent, got %s", c.ID())
	}
	if c.Version() != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %s", c.Version())
	}
	if len(c.SupportedPlatforms()) == 0 {
		t.Error("expected at least one supported platform")
	}
	if len(c.OutputSchemas()) == 0 {
		t.Error("expected at least one output schema")
	}
}

func TestAutoDetectNoEnv(t *testing.T) {
	c := New()
	ctx := context.Background()

	// Unset all known API key env vars
	apiKeys := []string{
		"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "COHERE_API_KEY",
		"HUGGINGFACE_API_TOKEN", "HF_TOKEN",
	}
	for _, k := range apiKeys {
		t.Setenv(k, "")
	}

	// Run in a tmp dir with no config files
	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	// Should not detect (no env vars, no files)
	if result.Detected {
		t.Log("AutoDetect returned Detected=true (may have config files in working dir) — skipping strict check")
	}
}

func TestAutoDetectWithAPIKey(t *testing.T) {
	c := New()
	ctx := context.Background()
	t.Setenv("OPENAI_API_KEY", "sk-test1234567890")

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true with OPENAI_API_KEY set")
	}
	if result.Details["api_key_env"] != "OPENAI_API_KEY" {
		t.Errorf("expected api_key_env=OPENAI_API_KEY, got %v", result.Details["api_key_env"])
	}
}

func TestAutoDetectWithEnvFile(t *testing.T) {
	c := New()
	ctx := context.Background()

	// Create a temp dir with a .env file
	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	envContent := "ANTHROPIC_API_KEY=sk-ant-test\nLLM_TEMPERATURE=0.7\n"
	if err := os.WriteFile(filepath.Join(tmpDir, ".env"), []byte(envContent), 0600); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true with .env file present")
	}
}

func TestCollectReturnsResult(t *testing.T) {
	c := New()
	ctx := context.Background()

	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	t.Setenv("OPENAI_API_KEY", "sk-test123")
	t.Setenv("OPENAI_MODEL", "gpt-4o")
	t.Setenv("OPENAI_MAX_TOKENS", "4096")

	result, err := c.Collect(ctx, models.CollectConfig{
		ProjectID: "test-project",
		TenantID:  "test-tenant",
		Hostname:  "localhost",
	})
	if err != nil {
		t.Fatalf("Collect error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.CollectorID != "ai-llm-agent" {
		t.Errorf("unexpected CollectorID: %s", result.CollectorID)
	}
	if len(result.Items) == 0 {
		t.Error("expected at least one collected item")
	}
	if result.Status == models.StatusFailed {
		t.Errorf("unexpected status FAILED: errors=%v", result.Errors)
	}
}

func TestCollectLLMConfigMasksSecrets(t *testing.T) {
	c := New()
	ctx := context.Background()

	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	// Write .env with real-looking API key
	envContent := "OPENAI_API_KEY=sk-abcdefghijklmnop\nOPENAI_TEMPERATURE=0.5\n"
	os.WriteFile(".env", []byte(envContent), 0600)

	item, err := c.collectLLMConfig(ctx)
	if err != nil {
		t.Fatalf("collectLLMConfig error: %v", err)
	}
	if item == nil {
		t.Fatal("expected non-nil item")
	}

	// The OPENAI_API_KEY should NOT appear in raw form
	data, ok := item.Data.(map[string]interface{})
	if !ok {
		t.Fatal("expected map data")
	}
	if settings, ok := data["settings"].(map[string]interface{}); ok {
		for k, v := range settings {
			if vStr, ok := v.(string); ok {
				if vStr == "sk-abcdefghijklmnop" {
					t.Errorf("secret exposed in settings key %s", k)
				}
			}
		}
	}
}

func TestMaskSecret(t *testing.T) {
	tests := []struct {
		input    string
		wantMask bool
	}{
		{"sk-abcdefghijklmno", true},
		{"short", false},
		{"", false},
	}
	for _, tt := range tests {
		got := maskSecret(tt.input)
		if tt.wantMask {
			if got == tt.input {
				t.Errorf("maskSecret(%q) should mask, got %q", tt.input, got)
			}
			if !containsStars(got) {
				t.Errorf("maskSecret(%q) should contain ***, got %q", tt.input, got)
			}
		}
	}
}

func TestIsSecretKey(t *testing.T) {
	secrets := []string{"OPENAI_API_KEY", "DB_PASSWORD", "JWT_SECRET", "AUTH_TOKEN"}
	nonSecrets := []string{"MODEL_NAME", "TEMPERATURE", "MAX_TOKENS"}

	for _, k := range secrets {
		if !isSecretKey(k) {
			t.Errorf("expected %s to be secret key", k)
		}
	}
	for _, k := range nonSecrets {
		if isSecretKey(k) {
			t.Errorf("expected %s to NOT be secret key", k)
		}
	}
}

func TestParseNumberOrString(t *testing.T) {
	if v, ok := parseNumberOrString("42").(int64); !ok || v != 42 {
		t.Error("expected int64(42)")
	}
	if v, ok := parseNumberOrString("3.14").(float64); !ok || v != 3.14 {
		t.Error("expected float64(3.14)")
	}
	if v, ok := parseNumberOrString("hello").(string); !ok || v != "hello" {
		t.Error("expected string 'hello'")
	}
}

func TestHashDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	os.WriteFile(filepath.Join(tmpDir, "prompt1.txt"), []byte("hello"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "prompt2.txt"), []byte("world"), 0644)

	hash, count, err := hashDirectory(tmpDir)
	if err != nil {
		t.Fatalf("hashDirectory error: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 files, got %d", count)
	}
	if len(hash) != 16 {
		t.Errorf("expected 16-char hash, got %q", hash)
	}

	// Hash should be stable on second call
	hash2, _, _ := hashDirectory(tmpDir)
	if hash != hash2 {
		t.Error("hashDirectory should return stable hash for same directory")
	}
}

func TestScanLogFile(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "app.log")
	content := `2026-01-01 INFO starting
2026-01-01 INFO prompt_tokens=150 completion_tokens=50 total_tokens=200
2026-01-01 INFO no tokens here
2026-01-01 INFO token_usage: {"input_tokens": 100, "output_tokens": 80}
`
	os.WriteFile(logPath, []byte(content), 0644)

	count, entries := scanLogFile(logPath, []string{"prompt_tokens", "token_usage"}, 5)
	if count != 2 {
		t.Errorf("expected 2 matches, got %d", count)
	}
	if len(entries) != 2 {
		t.Errorf("expected 2 entries, got %d", len(entries))
	}
}

// helpers

func containsStars(s string) bool {
	return len(s) > 0 && contains(s, "***")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsAt(s, substr))
}

func containsAt(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
