package llm

import (
	"bufio"
	"context"
	"crypto/sha256"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers LLM/Agent configuration and runtime metadata.
// Covers: LLM API settings, agent loop safety, rate limiting,
// prompt versioning, token usage logs, and guardrail config.
type Collector struct{}

func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "ai-llm-agent" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	privs := []models.Privilege{
		{Type: "read", Target: ".", Description: "read app config files (.env, config.yaml, pyproject.toml)"},
	}
	if runtime.GOOS != "windows" {
		privs = append(privs,
			models.Privilege{Type: "exec", Target: "python3", Description: "check installed AI libraries via pip"},
			models.Privilege{Type: "exec", Target: "pip3", Description: "list installed packages"},
		)
	}
	return privs
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"ai.llm_api_config.v1",
		"ai.agent_loop_safety.v1",
		"ai.rate_limiting.v1",
		"ai.prompt_versioning.v1",
		"ai.token_usage.v1",
		"ai.guardrail_config.v1",
	}
}

// AutoDetect returns true if any LLM/Agent framework environment is found.
// Checks env vars (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) and .env/.yaml config files.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	details := map[string]string{}

	// 1. Known AI API key environment variables
	apiKeyVars := []string{
		"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "COHERE_API_KEY",
		"HUGGINGFACE_API_TOKEN", "HF_TOKEN", "REPLICATE_API_KEY",
		"MISTRAL_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY",
		"TOGETHER_API_KEY", "FIREWORKS_API_KEY",
	}
	for _, v := range apiKeyVars {
		if val := os.Getenv(v); val != "" {
			details["api_key_env"] = v
			break
		}
	}

	// 2. .env file in current and parent directories (up to 3 levels)
	if path := findEnvFile(); path != "" {
		details["env_file"] = path
	}

	// 3. Known config files
	for _, name := range []string{"config.yaml", "config.yml", "pyproject.toml", "langchain.yaml", "agent.yaml"} {
		if _, err := os.Stat(name); err == nil {
			details["config_file"] = name
			break
		}
	}

	// 4. Installed Python AI packages (best-effort, not required)
	if runtime.GOOS != "windows" {
		if libs := detectPythonLibs(ctx); len(libs) > 0 {
			details["python_libs"] = strings.Join(libs, ",")
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

	// Collect LLM API config
	if item, err := c.collectLLMConfig(ctx); err == nil {
		result.Items = append(result.Items, *item)
	} else {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("LLM config collection failed: %v", err),
		})
	}

	// Collect agent loop / safety settings
	if item, err := c.collectAgentConfig(); err == nil {
		result.Items = append(result.Items, *item)
	} else {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("agent config collection failed: %v", err),
		})
	}

	// Collect rate limiting settings
	if item, err := c.collectRateLimiting(); err == nil {
		result.Items = append(result.Items, *item)
	} else {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("rate limiting collection failed: %v", err),
		})
	}

	// Collect prompt versioning metadata
	if item, err := c.collectPromptVersioning(); err == nil {
		result.Items = append(result.Items, *item)
	}

	// Collect token usage summary
	if item, err := c.collectTokenUsage(); err == nil {
		result.Items = append(result.Items, *item)
	}

	// Collect guardrail config
	if item, err := c.collectGuardrailConfig(); err == nil {
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

// collectLLMConfig reads LLM API settings from .env and config files.
// API key values are masked; only their presence is recorded.
func (c *Collector) collectLLMConfig(ctx context.Context) (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"providers_detected": []string{},
		"settings":           map[string]interface{}{},
	}

	providers := []string{}

	// Parse .env files
	envVars := parseEnvFiles()

	// Detect providers from env vars
	providerEnvs := map[string]string{
		"openai":      "OPENAI_API_KEY",
		"anthropic":   "ANTHROPIC_API_KEY",
		"cohere":      "COHERE_API_KEY",
		"huggingface": "HUGGINGFACE_API_TOKEN",
		"mistral":     "MISTRAL_API_KEY",
		"google":      "GOOGLE_API_KEY",
	}
	for provider, envKey := range providerEnvs {
		if _, ok := envVars[envKey]; ok {
			providers = append(providers, provider)
		} else if os.Getenv(envKey) != "" {
			providers = append(providers, provider)
		}
	}

	// Extract LLM settings (non-secret fields)
	settings := map[string]interface{}{}
	settingKeys := []string{
		"OPENAI_MODEL", "OPENAI_TEMPERATURE", "OPENAI_MAX_TOKENS",
		"ANTHROPIC_MODEL", "MODEL_NAME", "LLM_TEMPERATURE", "LLM_MAX_TOKENS",
		"LLM_TIMEOUT", "LLM_STREAM", "LANGCHAIN_TRACING_V2", "LANGCHAIN_PROJECT",
	}
	for _, key := range settingKeys {
		if val, ok := envVars[key]; ok {
			settings[strings.ToLower(key)] = val
		} else if val := os.Getenv(key); val != "" {
			settings[strings.ToLower(key)] = val
		}
	}

	// Check Python AI libraries
	if runtime.GOOS != "windows" {
		libs := detectPythonLibs(ctx)
		if len(libs) > 0 {
			settings["python_ai_libs"] = libs
		}
	}

	data["providers_detected"] = providers
	data["settings"] = settings
	data["provider_count"] = len(providers)

	return &models.CollectedItem{
		SchemaName:    "ai.llm_api_config",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_llm_config",
		Category:      "ai",
		Data:          data,
	}, nil
}

// collectAgentConfig parses LangChain / LangGraph agent safety settings.
func (c *Collector) collectAgentConfig() (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"frameworks_detected": []string{},
	}

	frameworks := []string{}
	settings := map[string]interface{}{}
	envVars := parseEnvFiles()

	// LangChain detection
	if _, err := os.Stat("langchain.yaml"); err == nil {
		frameworks = append(frameworks, "langchain")
		if vals, err := parseSimpleYAML("langchain.yaml"); err == nil {
			for _, key := range []string{"max_iterations", "max_execution_time", "early_stopping_method", "timeout"} {
				if v, ok := vals[key]; ok {
					settings["langchain_"+key] = v
				}
			}
		}
	}
	// LangGraph
	if _, err := os.Stat("langgraph.yaml"); err == nil {
		frameworks = append(frameworks, "langgraph")
	}
	// CrewAI
	if _, err := os.Stat("crew.yaml"); err == nil {
		frameworks = append(frameworks, "crewai")
	}

	// Agent env var settings
	agentEnvKeys := map[string]string{
		"AGENT_MAX_ITERATIONS":     "max_iterations",
		"AGENT_TIMEOUT":            "timeout_seconds",
		"AGENT_MAX_EXECUTION_TIME": "max_execution_time",
		"LANGCHAIN_MAX_ITERATIONS": "langchain_max_iterations",
	}
	for envKey, settingKey := range agentEnvKeys {
		if val, ok := envVars[envKey]; ok {
			settings[settingKey] = val
		} else if val := os.Getenv(envKey); val != "" {
			settings[settingKey] = val
		}
	}

	// Detect common framework dirs
	for dir, framework := range map[string]string{
		"agents/":     "custom-agents",
		"workflows/":  "custom-workflows",
		"tools/":      "agent-tools",
		"graphs/":     "langgraph",
	} {
		if _, err := os.Stat(dir); err == nil {
			frameworks = append(frameworks, framework)
		}
	}

	data["frameworks_detected"] = dedupe(frameworks)
	data["settings"] = settings
	data["framework_count"] = len(dedupe(frameworks))

	return &models.CollectedItem{
		SchemaName:    "ai.agent_loop_safety",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_agent_config",
		Category:      "ai",
		Data:          data,
	}, nil
}

// collectRateLimiting reads rate limit configuration from env and config files.
func (c *Collector) collectRateLimiting() (*models.CollectedItem, error) {
	data := map[string]interface{}{}
	envVars := parseEnvFiles()

	rateLimitKeys := map[string]string{
		"OPENAI_RPM":              "openai_requests_per_minute",
		"OPENAI_TPM":              "openai_tokens_per_minute",
		"OPENAI_MAX_RETRIES":      "openai_max_retries",
		"ANTHROPIC_MAX_TOKENS":    "anthropic_max_tokens",
		"LLM_RPM":                 "llm_requests_per_minute",
		"LLM_TPM":                 "llm_tokens_per_minute",
		"LLM_MAX_RETRIES":         "llm_max_retries",
		"LLM_RETRY_DELAY":         "llm_retry_delay_seconds",
		"RATE_LIMIT_RPM":          "rate_limit_rpm",
		"RATE_LIMIT_TPM":          "rate_limit_tpm",
		"API_TIMEOUT":             "api_timeout_seconds",
		"API_MAX_CONCURRENT":      "api_max_concurrent",
	}

	for envKey, fieldKey := range rateLimitKeys {
		if val, ok := envVars[envKey]; ok {
			data[fieldKey] = parseNumberOrString(val)
		} else if val := os.Getenv(envKey); val != "" {
			data[fieldKey] = parseNumberOrString(val)
		}
	}

	return &models.CollectedItem{
		SchemaName:    "ai.rate_limiting",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_rate_limiting",
		Category:      "ai",
		Data:          data,
	}, nil
}

// collectPromptVersioning computes a git hash of the prompts directory.
// Content is not collected — only metadata (directory, hash, file count).
func (c *Collector) collectPromptVersioning() (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"prompt_dirs_found": []string{},
	}

	promptDirs := []string{"prompts", "prompt", "templates", "system_prompts", "instructions"}
	found := []string{}

	for _, dir := range promptDirs {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			found = append(found, dir)
			hash, count, err := hashDirectory(dir)
			if err == nil {
				data[dir+"_hash"] = hash
				data[dir+"_file_count"] = count
			}
		}
	}
	data["prompt_dirs_found"] = found

	// Try git rev-parse HEAD for the repo hash
	if out, err := exec.Command("git", "rev-parse", "HEAD").Output(); err == nil {
		data["git_head"] = strings.TrimSpace(string(out))
	}

	return &models.CollectedItem{
		SchemaName:    "ai.prompt_versioning",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_prompt_versioning",
		Category:      "ai",
		Data:          data,
	}, nil
}

// collectTokenUsage scans log files for token usage patterns.
func (c *Collector) collectTokenUsage() (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"log_files_scanned": 0,
		"usage_entries":     0,
	}

	// Common log directories
	logDirs := []string{"logs", "log", ".", "/var/log/app"}

	// Patterns to match token usage lines
	patterns := []string{
		"prompt_tokens", "completion_tokens", "total_tokens",
		"input_tokens", "output_tokens", "token_usage",
		"usage.total_tokens",
	}

	var totalEntries int
	var filesScanned int
	var recentUsage []map[string]interface{}

	for _, dir := range logDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			name := entry.Name()
			if !strings.HasSuffix(name, ".log") && !strings.HasSuffix(name, ".jsonl") &&
				!strings.HasSuffix(name, ".json") {
				continue
			}
			path := filepath.Join(dir, name)
			count, usage := scanLogFile(path, patterns, 10)
			if count > 0 {
				filesScanned++
				totalEntries += count
				recentUsage = append(recentUsage, usage...)
			}
		}
	}

	data["log_files_scanned"] = filesScanned
	data["usage_entries"] = totalEntries
	if len(recentUsage) > 10 {
		recentUsage = recentUsage[:10]
	}
	data["recent_entries"] = recentUsage

	return &models.CollectedItem{
		SchemaName:    "ai.token_usage",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_token_usage",
		Category:      "ai",
		Data:          data,
	}, nil
}

// collectGuardrailConfig scans for NeMo Guardrails and similar config files.
func (c *Collector) collectGuardrailConfig() (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"guardrail_type":     "none",
		"config_files_found": []string{},
	}

	foundFiles := []string{}

	// NeMo Guardrails
	nemoPaths := []string{
		"config/config.yml", "config/config.yaml",
		"guardrails.yaml", "guardrails/config.yaml",
		"nemo_guardrails.yaml",
	}
	for _, p := range nemoPaths {
		if _, err := os.Stat(p); err == nil {
			foundFiles = append(foundFiles, p)
			data["guardrail_type"] = "nemo-guardrails"
			if vals, err := parseSimpleYAML(p); err == nil {
				for _, key := range []string{"instructions", "rails", "models", "actions"} {
					if v, ok := vals[key]; ok {
						data["nemo_"+key] = v
					}
				}
			}
		}
	}

	// LLM Guard / Guardrails AI
	guardPaths := []string{
		"guardrails_config.json", "llm_guard.yaml",
		".guardrails", "guardrails/policy.yaml",
	}
	for _, p := range guardPaths {
		if _, err := os.Stat(p); err == nil {
			foundFiles = append(foundFiles, p)
			if data["guardrail_type"] == "none" {
				data["guardrail_type"] = "llm-guard"
			}
		}
	}

	// Environment-based guardrail settings
	envVars := parseEnvFiles()
	guardrailEnvs := []string{
		"GUARDRAILS_ENABLED", "CONTENT_FILTER_ENABLED",
		"PII_DETECTION_ENABLED", "TOXIC_CONTENT_FILTER",
		"GUARDRAILS_API_KEY",
	}
	guardrailSettings := map[string]interface{}{}
	for _, key := range guardrailEnvs {
		if val, ok := envVars[key]; ok {
			guardrailSettings[strings.ToLower(key)] = val
		} else if val := os.Getenv(key); val != "" {
			guardrailSettings[strings.ToLower(key)] = val
		}
	}
	if len(guardrailSettings) > 0 {
		data["env_settings"] = guardrailSettings
		if data["guardrail_type"] == "none" {
			data["guardrail_type"] = "env-configured"
		}
	}

	data["config_files_found"] = foundFiles

	return &models.CollectedItem{
		SchemaName:    "ai.guardrail_config",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_guardrail_config",
		Category:      "ai",
		Data:          data,
	}, nil
}

// --- helpers ---

// findEnvFile returns the path of the first .env file found in current and parent dirs.
func findEnvFile() string {
	candidates := []string{".env", ".env.local", ".env.production", "../.env", "../../.env"}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// parseEnvFiles reads all .env variant files and returns key=value pairs.
// Keys corresponding to secrets are kept as-is (caller must mask before output).
func parseEnvFiles() map[string]string {
	result := map[string]string{}
	candidates := []string{".env", ".env.local", ".env.example", ".env.sample"}
	for _, p := range candidates {
		if f, err := os.Open(p); err == nil {
			scanner := bufio.NewScanner(f)
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					key := strings.TrimSpace(parts[0])
					val := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
					// Mask secret keys
					if isSecretKey(key) {
						result[key] = maskSecret(val)
					} else {
						result[key] = val
					}
				}
			}
			f.Close()
		}
	}
	return result
}

// isSecretKey returns true if the key looks like a secret/credential.
func isSecretKey(key string) bool {
	secretSuffixes := []string{"_KEY", "_TOKEN", "_SECRET", "_PASSWORD", "_PASS", "_CREDENTIAL"}
	upper := strings.ToUpper(key)
	for _, s := range secretSuffixes {
		if strings.HasSuffix(upper, s) {
			return true
		}
	}
	return false
}

// maskSecret returns a masked version of a secret value showing only first/last chars.
func maskSecret(val string) string {
	if len(val) <= 8 {
		return "***"
	}
	return val[:3] + "***" + val[len(val)-3:]
}

// detectPythonLibs returns installed AI-related Python packages using pip list.
func detectPythonLibs(ctx context.Context) []string {
	aiLibs := []string{
		"openai", "anthropic", "langchain", "langchain-core", "langchain-community",
		"langgraph", "llama-index", "llama_index", "crewai", "autogen",
		"transformers", "sentence-transformers", "cohere", "mistralai",
		"nemoguardrails", "guardrails-ai", "llm-guard",
	}

	cmds := [][]string{
		{"pip3", "list", "--format=columns"},
		{"pip", "list", "--format=columns"},
	}

	for _, cmdArgs := range cmds {
		out, err := exec.CommandContext(ctx, cmdArgs[0], cmdArgs[1:]...).Output()
		if err != nil {
			continue
		}
		found := []string{}
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) < 1 {
				continue
			}
			pkg := strings.ToLower(fields[0])
			for _, lib := range aiLibs {
				if pkg == lib || pkg == strings.ReplaceAll(lib, "-", "_") {
					found = append(found, lib)
					break
				}
			}
		}
		return found
	}
	return nil
}

// hashDirectory computes a stable SHA-256 hash over file names and sizes in a directory.
// File contents are NOT read (metadata only).
func hashDirectory(dir string) (string, int, error) {
	h := sha256.New()
	count := 0
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		fmt.Fprintf(h, "%s|%d|%d\n", path, info.Size(), info.ModTime().Unix())
		count++
		return nil
	})
	if err != nil {
		return "", 0, err
	}
	return fmt.Sprintf("%x", h.Sum(nil))[:16], count, nil
}

// parseSimpleYAML is a minimal YAML top-level key parser (no dep on yaml library for this simple case).
// Returns only string/number values from top-level keys.
func parseSimpleYAML(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	result := map[string]string{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		// Skip comments and nested keys (indented)
		if strings.HasPrefix(line, "#") || (len(line) > 0 && unicode.IsSpace(rune(line[0]))) {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"'`)
		if key != "" && val != "" {
			result[key] = val
		}
	}
	return result, nil
}

// scanLogFile scans up to maxLines lines of a log file for token usage patterns.
func scanLogFile(path string, patterns []string, maxMatches int) (int, []map[string]interface{}) {
	f, err := os.Open(path)
	if err != nil {
		return 0, nil
	}
	defer f.Close()

	var entries []map[string]interface{}
	count := 0
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 64*1024)

	linesScanned := 0
	for scanner.Scan() && linesScanned < 50000 {
		line := scanner.Text()
		linesScanned++
		for _, pattern := range patterns {
			if strings.Contains(line, pattern) {
				count++
				if len(entries) < maxMatches {
					entries = append(entries, map[string]interface{}{
						"line":    linesScanned,
						"pattern": pattern,
						"snippet": truncate(line, 120),
					})
				}
				break
			}
		}
	}
	return count, entries
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func parseNumberOrString(s string) interface{} {
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return s
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
