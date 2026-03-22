package vectordb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestCollectorMetadata(t *testing.T) {
	c := New()
	if c.ID() != "ai-vectordb" {
		t.Errorf("expected ID ai-vectordb, got %s", c.ID())
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

func TestAutoDetectNoVectorDB(t *testing.T) {
	c := New()
	ctx := context.Background()

	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	// No processes running, no env vars, no config files in tmpDir
	t.Setenv("PINECONE_API_KEY", "")

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	// May or may not detect depending on environment — just ensure no error
	_ = result
}

func TestAutoDetectWithPineconeKey(t *testing.T) {
	c := New()
	ctx := context.Background()
	t.Setenv("PINECONE_API_KEY", "pc-test-key")

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true with PINECONE_API_KEY set")
	}
	if result.Details["pinecone_apikey"] != "present" {
		t.Errorf("expected pinecone_apikey=present, got %v", result.Details["pinecone_apikey"])
	}
}

func TestAutoDetectWithConfigFile(t *testing.T) {
	c := New()
	ctx := context.Background()

	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	os.WriteFile(filepath.Join(tmpDir, "embedding_config.yaml"), []byte("embedding_model: text-embedding-3-small\n"), 0644)

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true with embedding_config.yaml present")
	}
}

func TestCollectVectorDBHealthNoServices(t *testing.T) {
	c := New()
	ctx := context.Background()

	item, err := c.collectVectorDBHealth(ctx)
	if err != nil {
		t.Fatalf("collectVectorDBHealth error: %v", err)
	}
	if item == nil {
		t.Fatal("expected non-nil item")
	}

	data, ok := item.Data.(map[string]interface{})
	if !ok {
		t.Fatal("expected map data")
	}
	if data["instances_found"] == nil {
		t.Error("expected instances_found field")
	}
}

func TestCollectVectorDBHealthWithMockQdrant(t *testing.T) {
	// Mock Qdrant health endpoint
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/healthz":
			w.WriteHeader(http.StatusOK)
		case "/collections":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"result":{"collections":[{"name":"docs"},{"name":"code"}]}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	// Override Qdrant entry for test
	origDBs := knownVectorDBs
	defer func() { knownVectorDBs = origDBs }()

	// Parse port from test server URL
	parsed, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatalf("parse test server URL: %v", err)
	}
	port, err := strconv.Atoi(parsed.Port())
	if err != nil || port == 0 {
		t.Skip("could not parse test server port")
	}

	knownVectorDBs = []vectorDBDef{
		{
			Name: "qdrant", Processes: nil, DefaultPort: port,
			HealthPath: "/healthz", CollectionsPath: "/collections",
		},
	}

	c := New()
	ctx := context.Background()

	item, err := c.collectVectorDBHealth(ctx)
	if err != nil {
		t.Fatalf("collectVectorDBHealth error: %v", err)
	}

	data := item.Data.(map[string]interface{})
	if data["instances_reachable"].(int) != 1 {
		t.Errorf("expected 1 reachable instance, got %v", data["instances_reachable"])
	}

	instances := data["instances"].([]VectorDBStatus)
	if len(instances) != 1 {
		t.Fatalf("expected 1 instance, got %d", len(instances))
	}
	if !instances[0].Reachable {
		t.Error("expected Qdrant instance to be reachable")
	}
	if instances[0].Collections != 2 {
		t.Errorf("expected 2 collections, got %d", instances[0].Collections)
	}
}

func TestCollectEmbeddingConfig(t *testing.T) {
	c := New()

	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	configContent := `embedding_model: text-embedding-3-small
embedding_dim: 1536
chunk_size: 512
chunk_overlap: 50
reranker_model: cross-encoder/ms-marco-MiniLM-L-6-v2
index_type: HNSW
`
	os.WriteFile("embedding_config.yaml", []byte(configContent), 0644)

	item, err := c.collectEmbeddingConfig()
	if err != nil {
		t.Fatalf("collectEmbeddingConfig error: %v", err)
	}
	if item == nil {
		t.Fatal("expected non-nil item")
	}

	data := item.Data.(map[string]interface{})
	if data["embedding_config_found"] != true {
		t.Error("expected embedding_config_found=true")
	}

	embedding, ok := data["embedding"].(map[string]interface{})
	if !ok {
		t.Fatal("expected embedding section")
	}
	if embedding["embedding_model"] != "text-embedding-3-small" {
		t.Errorf("unexpected embedding_model: %v", embedding["embedding_model"])
	}

	chunking, ok := data["chunking"].(map[string]interface{})
	if !ok {
		t.Fatal("expected chunking section")
	}
	if chunking["chunk_size"] != "512" {
		t.Errorf("unexpected chunk_size: %v", chunking["chunk_size"])
	}
}

func TestCollectPIIConfig(t *testing.T) {
	c := New()

	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	piiContent := `pii_entities: PERSON,EMAIL,PHONE
masking_strategy: replace
threshold: 0.85
`
	os.WriteFile("pii_config.yaml", []byte(piiContent), 0644)

	item, err := c.collectPIIConfig()
	if err != nil {
		t.Fatalf("collectPIIConfig error: %v", err)
	}

	data := item.Data.(map[string]interface{})
	if data["pii_detection_enabled"] != true {
		t.Error("expected pii_detection_enabled=true")
	}
}

func TestCollectResult(t *testing.T) {
	c := New()
	ctx := context.Background()

	tmpDir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(tmpDir)

	result, err := c.Collect(ctx, models.CollectConfig{
		ProjectID: "test",
		Hostname:  "localhost",
	})
	if err != nil {
		t.Fatalf("Collect error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.CollectorID != "ai-vectordb" {
		t.Errorf("unexpected CollectorID: %s", result.CollectorID)
	}
	// Should have at least the health item
	if len(result.Items) == 0 {
		t.Error("expected at least one collected item")
	}
}

func TestMakeSet(t *testing.T) {
	keys := []string{"a", "b", "c", "a"}
	s := makeSet(keys)
	if !s["a"] || !s["b"] || !s["c"] {
		t.Error("expected all keys in set")
	}
	if s["d"] {
		t.Error("unexpected key d in set")
	}
}

func TestParseYAMLFields(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.yaml")
	content := `# comment
key1: value1
key2: "value2"
key3: 42
  indented: ignored
key4: 'quoted'
`
	os.WriteFile(path, []byte(content), 0644)

	orig, _ := os.Getwd()
	defer os.Chdir(orig)

	vals, err := parseYAMLFields(path, []string{"key1", "key2", "key3", "key4", "key5"})
	if err != nil {
		t.Fatalf("parseYAMLFields error: %v", err)
	}
	if vals["key1"] != "value1" {
		t.Errorf("expected key1=value1, got %q", vals["key1"])
	}
	if vals["key2"] != "value2" {
		t.Errorf("expected key2=value2 (unquoted), got %q", vals["key2"])
	}
	if vals["key4"] != "quoted" {
		t.Errorf("expected key4=quoted, got %q", vals["key4"])
	}
	if _, ok := vals["key5"]; ok {
		t.Error("key5 should not be present")
	}
}

