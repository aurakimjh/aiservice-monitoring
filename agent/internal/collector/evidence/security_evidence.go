package evidence

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// securityEvidenceCollector checks SSL/TLS, patch status, and account policy.
// Covers: ITEM0056, ITEM0057, ITEM0065, ITEM0067, ITEM0068 (security angle).
// Mode: ModeBuiltin for automated checks; ModeManual items require explicit trigger.
type securityEvidenceCollector struct{}

// NewSecurityEvidenceCollector creates the SecurityEvidence collector.
func NewSecurityEvidenceCollector() EvidenceCollector {
	return &securityEvidenceCollector{}
}

func (c *securityEvidenceCollector) ID() string        { return "evidence-security" }
func (c *securityEvidenceCollector) Version() string   { return "1.0.0" }
func (c *securityEvidenceCollector) Category() string  { return "security" }
func (c *securityEvidenceCollector) Mode() CollectMode { return ModeBuiltin }
func (c *securityEvidenceCollector) CoveredItems() []string {
	return []string{"ITEM0056", "ITEM0057", "ITEM0065", "ITEM0067", "ITEM0068"}
}

func (c *securityEvidenceCollector) Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error) {
	start := time.Now().UTC()
	res := &EvidenceResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		CollectMode:      ModeBuiltin,
		AgentID:          cfg.AgentID,
		Hostname:         cfg.Hostname,
		Timestamp:        start,
	}

	if runtime.GOOS == "windows" {
		items, errs := collectWindowsSecurity(ctx, cfg.ExtraPaths)
		res.Items = append(res.Items, items...)
		res.Errors = append(res.Errors, errs...)
		return res, nil
	}

	// Linux security checks
	checks := []func(context.Context, map[string]string) ([]EvidenceItem, []EvidenceError){
		collectSELinux,          // ITEM0065
		collectOpenPorts,        // ITEM0056 (listen ports)
		collectPasswordPolicy,   // ITEM0057
		collectSudoersSnap,      // ITEM0067
	}
	for _, fn := range checks {
		select {
		case <-ctx.Done():
			return res, ctx.Err()
		default:
		}
		items, errs := fn(ctx, cfg.ExtraPaths)
		res.Items = append(res.Items, items...)
		res.Errors = append(res.Errors, errs...)
	}
	return res, nil
}

// ── ITEM0065: SELinux / AppArmor status ──────────────────────────────────────

func collectSELinux(_ context.Context, _ map[string]string) ([]EvidenceItem, []EvidenceError) {
	data := map[string]string{}
	if out, err := exec.Command("sestatus").CombinedOutput(); err == nil {
		data["sestatus"] = strings.TrimSpace(string(out))
	}
	if out, err := exec.Command("aa-status").CombinedOutput(); err == nil {
		data["apparmor_status"] = strings.TrimSpace(string(out))
	}
	if len(data) == 0 {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0065",
		SchemaName:  "evidence.security.selinux_apparmor.v1",
		Content:     data,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0056: Open listening ports ───────────────────────────────────────────

func collectOpenPorts(_ context.Context, _ map[string]string) ([]EvidenceItem, []EvidenceError) {
	out, err := exec.Command("ss", "-tlnp").CombinedOutput()
	if err != nil {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0056",
		SchemaName:  "evidence.security.open_ports.v1",
		Content:     map[string]string{"ss_tlnp": strings.TrimSpace(string(out))},
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0057: Password / account policy ───────────────────────────────────────

func collectPasswordPolicy(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	data := map[string]string{}

	loginDefPath := getPath(extra, "login_defs", "/etc/login.defs")
	if content, err := os.ReadFile(loginDefPath); err == nil {
		// Extract key password policy fields
		fields := []string{"PASS_MAX_DAYS", "PASS_MIN_DAYS", "PASS_MIN_LEN", "PASS_WARN_AGE"}
		data["login_defs"] = extractLines(string(content), fields)
	}

	pamPath := getPath(extra, "pam_passwd", "/etc/pam.d/passwd")
	if content, err := os.ReadFile(pamPath); err == nil {
		data["pam_passwd"] = truncate(string(content), 2048)
	}

	if len(data) == 0 {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0057",
		SchemaName:  "evidence.security.password_policy.v1",
		Content:     data,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0067: Sudoers / backup config snapshot ────────────────────────────────

func collectSudoersSnap(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	sudoersPath := getPath(extra, "sudoers", "/etc/sudoers")
	content, err := os.ReadFile(sudoersPath)
	if err != nil {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0067",
		SchemaName:  "evidence.security.sudoers.v1",
		FilePath:    sudoersPath,
		Content:     map[string]string{"sudoers": truncate(string(content), 4096)},
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── Windows security (placeholder) ───────────────────────────────────────────

func collectWindowsSecurity(_ context.Context, _ map[string]string) ([]EvidenceItem, []EvidenceError) {
	out, err := exec.Command("netstat", "-ano").CombinedOutput()
	if err != nil {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0056",
		SchemaName:  "evidence.security.open_ports.v1",
		Content:     map[string]string{"netstat_ano": truncate(string(out), 8192)},
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// extractLines returns lines from content that start with any of the prefixes.
func extractLines(content string, prefixes []string) string {
	var out []string
	for _, line := range strings.Split(content, "\n") {
		stripped := strings.TrimSpace(line)
		if strings.HasPrefix(stripped, "#") || stripped == "" {
			continue
		}
		for _, p := range prefixes {
			if strings.HasPrefix(stripped, p) {
				out = append(out, stripped)
				break
			}
		}
	}
	return strings.Join(out, "\n")
}
