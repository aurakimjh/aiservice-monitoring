package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Config is the top-level agent configuration loaded from agent.yaml.
type Config struct {
	Agent       AgentConfig       `yaml:"agent"`
	Server      ServerConfig      `yaml:"server"`
	Schedule    ScheduleConfig    `yaml:"schedule"`
	Collectors  CollectorConfigs  `yaml:"collectors"`
	RemoteShell RemoteShellConfig `yaml:"remote_shell"`
	Buffer      BufferConfig      `yaml:"buffer"`
	Logging     LoggingConfig     `yaml:"logging"`
	// Diagnostic holds Phase 31 evidence collection settings.
	Diagnostic DiagnosticConfig `yaml:"diagnostic"`
}

type AgentConfig struct {
	ID   string           `yaml:"id"`
	Mode models.AgentMode `yaml:"mode"`
}

type ServerConfig struct {
	URL          string    `yaml:"url"`
	ProjectToken string    `yaml:"project_token"`
	TLS          TLSConfig `yaml:"tls"`
}

type TLSConfig struct {
	CertFile string `yaml:"cert"`
	KeyFile  string `yaml:"key"`
	CAFile   string `yaml:"ca"`
}

type ScheduleConfig struct {
	Default string `yaml:"default"` // cron expression for evidence collection
	Metrics string `yaml:"metrics"` // cron expression for metric push
}

type CollectorConfigs struct {
	OS        CollectorToggle `yaml:"os"`
	Web       WebCollectorCfg `yaml:"web"`
	WAS       CollectorToggle `yaml:"was"`
	DB        DBCollectorCfg  `yaml:"db"`
	AILLM     CollectorToggle `yaml:"ai_llm"`
	AIGPU     CollectorToggle `yaml:"ai_gpu"`
	AIVectorDB CollectorToggle `yaml:"ai_vectordb"`
	OTelMetrics OTelMetricsCfg `yaml:"otel_metrics"`
}

type CollectorToggle struct {
	Enabled string `yaml:"enabled"` // "true", "false", "auto"
}

func (c CollectorToggle) IsEnabled() bool {
	return c.Enabled == "true" || c.Enabled == "auto" || c.Enabled == ""
}

func (c CollectorToggle) IsAuto() bool {
	return c.Enabled == "auto" || c.Enabled == ""
}

type WebCollectorCfg struct {
	CollectorToggle `yaml:",inline"`
	ConfigPaths     []string `yaml:"config_paths,omitempty"`
}

type DBCollectorCfg struct {
	CollectorToggle `yaml:",inline"`
	Connections     []DBConnection `yaml:"connections,omitempty"`
}

type DBConnection struct {
	Type        string `yaml:"type"` // postgresql, mysql, oracle
	Host        string `yaml:"host"`
	Port        int    `yaml:"port"`
	User        string `yaml:"user"`
	PasswordEnv string `yaml:"password_env"` // environment variable name
}

type OTelMetricsCfg struct {
	CollectorToggle `yaml:",inline"`
	PrometheusURL   string `yaml:"prometheus_url,omitempty"`
}

type RemoteShellConfig struct {
	Enabled          bool     `yaml:"enabled"`
	AllowedRoles     []string `yaml:"allowed_roles"`
	MaxSessions      int      `yaml:"max_sessions"`
	IdleTimeout      int      `yaml:"idle_timeout"`       // seconds
	MaxDuration      int      `yaml:"max_session_duration"` // seconds
	BlockedCommands  []string `yaml:"blocked_commands"`
	AuditEnabled     bool     `yaml:"audit_enabled"`
	AuditLogPath     string   `yaml:"audit_log_path"`
}

type BufferConfig struct {
	Path      string `yaml:"path"`
	MaxSizeMB int    `yaml:"max_size_mb"`
}

// DiagnosticConfig holds Phase 31 evidence collection configuration.
type DiagnosticConfig struct {
	// Interval is the cron expression for scheduled diagnostic runs (default: daily at midnight).
	Interval string `yaml:"interval"`
	// ScriptBaseDir is the directory containing diagnostic scripts.
	ScriptBaseDir string `yaml:"script_base_dir"`
	// AuditLogPath is the path to the audit log file for 🖐️ manual triggers.
	AuditLogPath string `yaml:"audit_log_path"`
	// RunMode controls which collectors participate: "auto", "script", "full".
	RunMode string `yaml:"run_mode"`
	// Scripts is the 📜 ITEM ID → script file mapping (Phase 31-2c).
	Scripts []ScriptMapping `yaml:"scripts"`
}

// ScriptMapping links a diagnostic catalog ITEM ID to an external script.
type ScriptMapping struct {
	ItemID     string `yaml:"item_id"`
	ScriptPath string `yaml:"script_path"`
	Timeout    string `yaml:"timeout,omitempty"`
}

type LoggingConfig struct {
	Level      string `yaml:"level"` // debug, info, warn, error
	Path       string `yaml:"path"`
	MaxSizeMB  int    `yaml:"max_size_mb"`
	MaxBackups int    `yaml:"max_backups"`
}

// Load reads and parses the configuration file.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file %s: %w", path, err)
	}

	cfg := &Config{}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file %s: %w", path, err)
	}

	cfg.applyDefaults()
	return cfg, nil
}

func (c *Config) applyDefaults() {
	if c.Agent.Mode == "" {
		c.Agent.Mode = models.ModeFull
	}
	if c.Schedule.Default == "" {
		c.Schedule.Default = "0 */6 * * *"
	}
	if c.Schedule.Metrics == "" {
		c.Schedule.Metrics = "*/60 * * * * *"
	}
	if c.Buffer.MaxSizeMB == 0 {
		c.Buffer.MaxSizeMB = 500
	}
	if c.Logging.Level == "" {
		c.Logging.Level = "info"
	}
	if c.Logging.MaxSizeMB == 0 {
		c.Logging.MaxSizeMB = 100
	}
	if c.Logging.MaxBackups == 0 {
		c.Logging.MaxBackups = 5
	}
	if c.RemoteShell.MaxSessions == 0 {
		c.RemoteShell.MaxSessions = 3
	}
	if c.RemoteShell.IdleTimeout == 0 {
		c.RemoteShell.IdleTimeout = 600
	}
	if c.RemoteShell.MaxDuration == 0 {
		c.RemoteShell.MaxDuration = 3600
	}
	if c.Diagnostic.Interval == "" {
		c.Diagnostic.Interval = "0 0 * * *" // daily at midnight
	}
	if c.Diagnostic.RunMode == "" {
		c.Diagnostic.RunMode = "auto"
	}
}
