package vectordb

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// knownVectorDBs lists the supported VectorDB backends and their defaults.
var knownVectorDBs = []vectorDBDef{
	{Name: "qdrant", Processes: []string{"qdrant"}, DefaultPort: 6333, HealthPath: "/healthz", CollectionsPath: "/collections"},
	{Name: "milvus", Processes: []string{"milvus", "standalone"}, DefaultPort: 19530, HealthPath: "/v1/health", CollectionsPath: "/v1/vector/collections"},
	{Name: "chroma", Processes: []string{"chroma", "chromadb"}, DefaultPort: 8000, HealthPath: "/api/v1/heartbeat", CollectionsPath: "/api/v1/collections"},
	{Name: "weaviate", Processes: []string{"weaviate"}, DefaultPort: 8080, HealthPath: "/v1/.well-known/ready", CollectionsPath: "/v1/schema"},
}

type vectorDBDef struct {
	Name            string
	Processes       []string
	DefaultPort     int
	HealthPath      string
	CollectionsPath string
}

// Collector gathers VectorDB health, index metrics, and embedding configuration.
// Covers: Vector DB health, index metrics, embedding config, chunking/reranking settings, PII detection config.
type Collector struct {
	httpClient *http.Client
}

func New() *Collector {
	return &Collector{
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *Collector) ID() string      { return "ai-vectordb" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "net", Target: "localhost:6333", Description: "access Qdrant REST API"},
		{Type: "net", Target: "localhost:19530", Description: "access Milvus REST API"},
		{Type: "net", Target: "localhost:8000", Description: "access Chroma REST API"},
		{Type: "net", Target: "localhost:8080", Description: "access Weaviate REST API"},
		{Type: "read", Target: ".", Description: "read embedding/vectordb config files"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"ai.vectordb_health.v1",
		"ai.embedding_config.v1",
		"ai.chunking_config.v1",
		"ai.pii_detection_config.v1",
	}
}

// AutoDetect checks for running VectorDB processes or listening ports.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	details := map[string]string{}

	for _, db := range knownVectorDBs {
		// Process check
		for _, proc := range db.Processes {
			if isProcessRunning(proc) {
				details[db.Name+"_process"] = proc
				break
			}
		}
		// Port check (quick HTTP ping)
		if db.DefaultPort > 0 {
			if c.pingHTTP(ctx, fmt.Sprintf("http://localhost:%d%s", db.DefaultPort, db.HealthPath)) {
				details[db.Name+"_port"] = fmt.Sprintf("%d", db.DefaultPort)
			}
		}
	}

	// Pinecone (cloud-only, detect by API key)
	if os.Getenv("PINECONE_API_KEY") != "" {
		details["pinecone_apikey"] = "present"
	}

	// Embedding config file detection
	for _, f := range []string{"embedding_config.yaml", "embed_config.yaml", "vector_config.yaml", "rag_config.yaml"} {
		if _, err := os.Stat(f); err == nil {
			details["embedding_config_file"] = f
			break
		}
	}

	if len(details) == 0 {
		return models.DetectResult{Detected: false}, nil
	}
	return models.DetectResult{Detected: true, Details: details}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	var errs []models.CollectError

	if item, err := c.collectVectorDBHealth(ctx); err == nil {
		result.Items = append(result.Items, *item)
	} else {
		errs = append(errs, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("VectorDB health collection failed: %v", err),
		})
	}

	if item, err := c.collectEmbeddingConfig(); err == nil {
		result.Items = append(result.Items, *item)
	}

	if item, err := c.collectPIIConfig(); err == nil {
		result.Items = append(result.Items, *item)
	}

	result.Errors = errs
	result.Duration = time.Since(start)

	if len(result.Items) == 0 && len(errs) > 0 {
		result.Status = models.StatusFailed
	} else if len(errs) > 0 {
		result.Status = models.StatusPartial
	}

	return result, nil
}

// VectorDBStatus holds the health and basic stats for a single VectorDB instance.
type VectorDBStatus struct {
	Name        string `json:"name"`
	Reachable   bool   `json:"reachable"`
	Port        int    `json:"port"`
	HealthURL   string `json:"health_url"`
	Collections int    `json:"collections,omitempty"`
	Error       string `json:"error,omitempty"`
}

func (c *Collector) collectVectorDBHealth(ctx context.Context) (*models.CollectedItem, error) {
	statuses := []VectorDBStatus{}

	for _, db := range knownVectorDBs {
		if db.DefaultPort == 0 {
			continue
		}

		status := VectorDBStatus{
			Name:      db.Name,
			Port:      db.DefaultPort,
			HealthURL: fmt.Sprintf("http://localhost:%d%s", db.DefaultPort, db.HealthPath),
		}

		if c.pingHTTP(ctx, status.HealthURL) {
			status.Reachable = true
			if db.CollectionsPath != "" {
				status.Collections = c.countCollections(ctx, db.Name,
					fmt.Sprintf("http://localhost:%d%s", db.DefaultPort, db.CollectionsPath))
			}
		} else {
			status.Error = "connection refused or timeout"
		}

		// Include in report only if process found or reachable
		if status.Reachable || isProcessRunning(db.Name) {
			statuses = append(statuses, status)
		}
	}

	reachable := 0
	for _, s := range statuses {
		if s.Reachable {
			reachable++
		}
	}

	return &models.CollectedItem{
		SchemaName:    "ai.vectordb_health",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_vectordb_health",
		Category:      "ai",
		Data: map[string]interface{}{
			"instances_found":     len(statuses),
			"instances_reachable": reachable,
			"instances":           statuses,
		},
	}, nil
}

// countCollections queries the collections endpoint and returns the count.
func (c *Collector) countCollections(ctx context.Context, dbName, url string) int {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return 0
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return 0
	}

	// Qdrant: {"result": {"collections": [...]}}
	if result, ok := raw["result"].(map[string]interface{}); ok {
		if colls, ok := result["collections"].([]interface{}); ok {
			return len(colls)
		}
	}
	// Chroma / Milvus: {"data": [...]}
	if data, ok := raw["data"].([]interface{}); ok {
		return len(data)
	}
	// Weaviate: {"classes": [...]}
	if classes, ok := raw["classes"].([]interface{}); ok {
		return len(classes)
	}
	return 0
}

// collectEmbeddingConfig reads embedding, chunking, and reranking settings from config files.
func (c *Collector) collectEmbeddingConfig() (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"embedding_config_found": false,
	}

	configFiles := []string{
		"embedding_config.yaml", "embed_config.yaml",
		"vector_config.yaml", "rag_config.yaml", "config.yaml",
	}

	embeddingKeys := []string{
		"embedding_model", "embed_model", "model_name", "embedding_dim", "dimensions",
		"batch_size", "normalize_embeddings",
	}
	chunkingKeys := []string{"chunk_size", "chunk_overlap", "chunking_strategy", "split_by"}
	rerankKeys := []string{"reranker_model", "rerank_top_k", "rerank_model"}
	indexKeys := []string{"index_type", "metric_type", "ef_construction", "m"}

	allKeys := append(append(append(embeddingKeys, chunkingKeys...), rerankKeys...), indexKeys...)

	for _, configFile := range configFiles {
		vals, err := parseYAMLFields(configFile, allKeys)
		if err != nil || len(vals) == 0 {
			continue
		}
		data["embedding_config_found"] = true
		data["config_file"] = configFile

		embeddingKeySet := makeSet(embeddingKeys)
		chunkingKeySet := makeSet(chunkingKeys)
		rerankKeySet := makeSet(rerankKeys)
		indexKeySet := makeSet(indexKeys)

		embeddingSettings := map[string]interface{}{}
		chunkingSettings := map[string]interface{}{}
		rerankSettings := map[string]interface{}{}
		indexSettings := map[string]interface{}{}

		for k, v := range vals {
			switch {
			case embeddingKeySet[k]:
				embeddingSettings[k] = v
			case chunkingKeySet[k]:
				chunkingSettings[k] = v
			case rerankKeySet[k]:
				rerankSettings[k] = v
			case indexKeySet[k]:
				indexSettings[k] = v
			}
		}

		if len(embeddingSettings) > 0 {
			data["embedding"] = embeddingSettings
		}
		if len(chunkingSettings) > 0 {
			data["chunking"] = chunkingSettings
		}
		if len(rerankSettings) > 0 {
			data["reranking"] = rerankSettings
		}
		if len(indexSettings) > 0 {
			data["index"] = indexSettings
		}
		break
	}

	// Env var overrides
	envKeys := []string{
		"EMBEDDING_MODEL", "EMBED_MODEL", "CHUNK_SIZE", "CHUNK_OVERLAP",
		"VECTOR_DIMENSION", "RERANKER_MODEL",
	}
	envSettings := map[string]interface{}{}
	for _, key := range envKeys {
		if val := os.Getenv(key); val != "" {
			envSettings[strings.ToLower(key)] = val
		}
	}
	if len(envSettings) > 0 {
		data["env_settings"] = envSettings
	}

	return &models.CollectedItem{
		SchemaName:    "ai.embedding_config",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_embedding_config",
		Category:      "ai",
		Data:          data,
	}, nil
}

// collectPIIConfig reads PII detection and data masking configuration.
func (c *Collector) collectPIIConfig() (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"pii_detection_enabled": false,
	}

	for _, f := range []string{"pii_config.yaml", "pii_detection.yaml", "data_protection.yaml", "privacy_config.yaml"} {
		if _, err := os.Stat(f); err == nil {
			data["pii_config_file"] = f
			data["pii_detection_enabled"] = true
			if vals, err := parseYAMLFields(f, []string{
				"pii_entities", "masking_strategy", "anonymizer", "threshold", "language", "operators",
			}); err == nil {
				for k, v := range vals {
					data[k] = v
				}
			}
			break
		}
	}

	piiEnvs := []string{"PII_DETECTION_ENABLED", "DATA_MASKING_ENABLED", "PII_ENTITIES", "ANONYMIZER_TYPE"}
	for _, key := range piiEnvs {
		if val := os.Getenv(key); val != "" {
			data[strings.ToLower(key)] = val
			data["pii_detection_enabled"] = true
		}
	}

	return &models.CollectedItem{
		SchemaName:    "ai.pii_detection_config",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_pii_config",
		Category:      "ai",
		Data:          data,
	}, nil
}

// --- helpers ---

func (c *Collector) pingHTTP(ctx context.Context, url string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode < 500
}

// isProcessRunning checks if a process with the given name is currently running.
func isProcessRunning(name string) bool {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux", "darwin":
		cmd = exec.Command("pgrep", "-x", name)
	case "windows":
		cmd = exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq %s.exe", name), "/NH")
	default:
		return false
	}
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	output := strings.TrimSpace(string(out))
	return output != "" && !strings.Contains(output, "No tasks are running")
}

// parseYAMLFields reads a YAML file and returns specified top-level string values.
func parseYAMLFields(path string, keys []string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	keySet := makeSet(keys)
	result := map[string]string{}
	scanner := bufio.NewScanner(f)

	for scanner.Scan() {
		line := scanner.Text()
		// Skip comments and indented (nested) lines
		if strings.HasPrefix(line, "#") {
			continue
		}
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"'`)
		if keySet[key] && val != "" {
			result[key] = val
		}
	}
	return result, nil
}

func makeSet(keys []string) map[string]bool {
	s := make(map[string]bool, len(keys))
	for _, k := range keys {
		s[k] = true
	}
	return s
}
