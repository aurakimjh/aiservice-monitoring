package sanitizer

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Sanitizer masks sensitive data (API keys, PII) in collected data before transmission.
type Sanitizer struct {
	patterns []*pattern
}

type pattern struct {
	name    string
	regex   *regexp.Regexp
	replace string
}

// New creates a Sanitizer with default masking patterns.
func New() *Sanitizer {
	return &Sanitizer{
		patterns: defaultPatterns(),
	}
}

func defaultPatterns() []*pattern {
	return []*pattern{
		// API keys
		{name: "openai_key", regex: regexp.MustCompile(`sk-[A-Za-z0-9]{20,}`), replace: "sk-***MASKED***"},
		{name: "anthropic_key", regex: regexp.MustCompile(`sk-ant-[A-Za-z0-9\-]{20,}`), replace: "sk-ant-***MASKED***"},
		{name: "aws_key", regex: regexp.MustCompile(`AKIA[0-9A-Z]{16}`), replace: "AKIA***MASKED***"},
		{name: "generic_api_key", regex: regexp.MustCompile(`(?i)(api[_-]?key|apikey|api[_-]?secret|api[_-]?token)\s*[=:]\s*["']?([A-Za-z0-9\-_]{16,})["']?`), replace: "${1}=***MASKED***"},
		{name: "bearer_token", regex: regexp.MustCompile(`(?i)(bearer)\s+[A-Za-z0-9\-_.]+`), replace: "Bearer ***MASKED***"},

		// Passwords
		{name: "password_field", regex: regexp.MustCompile(`(?i)(password|passwd|pwd)\s*[=:]\s*["']?[^\s"']+["']?`), replace: "${1}=***MASKED***"},

		// PII patterns
		{name: "email", regex: regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`), replace: "***EMAIL***"},
		{name: "phone_kr", regex: regexp.MustCompile(`01[016789]-?\d{3,4}-?\d{4}`), replace: "***PHONE***"},
		{name: "ssn_kr", regex: regexp.MustCompile(`\d{6}-[1-4]\d{6}`), replace: "***SSN***"},
		{name: "credit_card", regex: regexp.MustCompile(`\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`), replace: "***CARD***"},

		// Connection strings
		{name: "db_conn", regex: regexp.MustCompile(`(?i)(postgres|mysql|mongodb)://[^\s]+`), replace: "${1}://***MASKED***"},
	}
}

// SanitizeString masks sensitive data in a string.
func (s *Sanitizer) SanitizeString(input string) string {
	result := input
	for _, p := range s.patterns {
		result = p.regex.ReplaceAllString(result, p.replace)
	}
	return result
}

// SanitizeJSON masks sensitive data in JSON bytes.
func (s *Sanitizer) SanitizeJSON(data []byte) ([]byte, error) {
	str := s.SanitizeString(string(data))
	// Validate that it's still valid JSON
	var check json.RawMessage
	if err := json.Unmarshal([]byte(str), &check); err != nil {
		return data, err
	}
	return []byte(str), nil
}

// SanitizeMap recursively masks sensitive data in map values.
func (s *Sanitizer) SanitizeMap(m map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{}, len(m))
	for k, v := range m {
		result[k] = s.sanitizeValue(k, v)
	}
	return result
}

func (s *Sanitizer) sanitizeValue(key string, value interface{}) interface{} {
	lowerKey := strings.ToLower(key)

	// Mask entire value if key looks sensitive
	sensitiveKeys := []string{"password", "secret", "token", "api_key", "apikey", "private_key", "credentials"}
	for _, sk := range sensitiveKeys {
		if strings.Contains(lowerKey, sk) {
			return "***MASKED***"
		}
	}

	switch v := value.(type) {
	case string:
		return s.SanitizeString(v)
	case map[string]interface{}:
		return s.SanitizeMap(v)
	case []interface{}:
		arr := make([]interface{}, len(v))
		for i, item := range v {
			arr[i] = s.sanitizeValue("", item)
		}
		return arr
	default:
		return v
	}
}

// ContainsSensitive checks if a string contains any unmasked sensitive patterns.
func (s *Sanitizer) ContainsSensitive(input string) bool {
	for _, p := range s.patterns {
		if p.regex.MatchString(input) {
			return true
		}
	}
	return false
}
