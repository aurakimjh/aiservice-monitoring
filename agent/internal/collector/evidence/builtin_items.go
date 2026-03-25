package evidence

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// builtinItemsCollector gathers diagnostic items that read /proc, sysfs, or
// run lightweight commands (🔧). These complement the config/log/eos collectors
// and cover ITEM0013·0015·0037·0040·0044·0063·0064·0066·0070.
type builtinItemsCollector struct{}

// NewBuiltinItemsCollector creates the builtin diagnostic items collector.
func NewBuiltinItemsCollector() EvidenceCollector {
	return &builtinItemsCollector{}
}

func (c *builtinItemsCollector) ID() string        { return "evidence-builtin-items" }
func (c *builtinItemsCollector) Version() string   { return "1.0.0" }
func (c *builtinItemsCollector) Category() string  { return "system" }
func (c *builtinItemsCollector) Mode() CollectMode { return ModeBuiltin }
func (c *builtinItemsCollector) CoveredItems() []string {
	return []string{
		"ITEM0013", // NTP / Syslog config
		"ITEM0015", // OS network statistics
		"ITEM0037", // TCP CLOSE_WAIT
		"ITEM0040", // Page In/Out & Swapping
		"ITEM0044", // IPC parameters
		"ITEM0063", // Network routing & NFS
		"ITEM0064", // Disk / storage config
		"ITEM0066", // Running processes & services
		"ITEM0070", // Auto-restart config
	}
}

func (c *builtinItemsCollector) Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error) {
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
		return res, nil // most /proc-based items are Linux-only
	}

	collectors := []func(context.Context, map[string]string) ([]EvidenceItem, []EvidenceError){
		collectNTP,        // ITEM0013
		collectNetStats,   // ITEM0015
		collectCloseWait,  // ITEM0037
		collectVMStats,    // ITEM0040
		collectIPC,        // ITEM0044
		collectRouting,    // ITEM0063
		collectDiskConfig, // ITEM0064
		collectProcesses,  // ITEM0066
		collectAutoRestart, // ITEM0070
	}

	for _, fn := range collectors {
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

// ── ITEM0013: NTP / Syslog configuration ─────────────────────────────────────

func collectNTP(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	paths := []string{
		getPath(extra, "chrony_conf", "/etc/chrony.conf"),
		"/etc/ntp.conf",
		"/etc/rsyslog.conf",
	}
	var results []map[string]string
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		entry := map[string]string{"file": p, "content": truncate(string(data), 4096)}
		results = append(results, entry)
	}
	if len(results) == 0 {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0013",
		SchemaName:  "evidence.system.ntp_syslog_config.v1",
		Content:     results,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0015: OS network statistics ──────────────────────────────────────────

func collectNetStats(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	data := map[string]interface{}{}

	// /proc/net/dev
	netDevPath := getPath(extra, "proc_net_dev", "/proc/net/dev")
	if content, err := os.ReadFile(netDevPath); err == nil {
		data["proc_net_dev"] = parseNetDev(string(content))
	}

	// /proc/net/sockstat
	sockstatPath := getPath(extra, "proc_net_sockstat", "/proc/net/sockstat")
	if content, err := os.ReadFile(sockstatPath); err == nil {
		data["sockstat"] = truncate(string(content), 2048)
	}

	if len(data) == 0 {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0015",
		SchemaName:  "evidence.system.network_stats.v1",
		Content:     data,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0037: TCP CLOSE_WAIT ──────────────────────────────────────────────────

func collectCloseWait(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	sockstatPath := getPath(extra, "proc_net_sockstat", "/proc/net/sockstat")
	data, err := os.ReadFile(sockstatPath)
	if err != nil {
		return nil, nil
	}
	count := 0
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "TCP:") {
			// Rough parse: count tw (TIME_WAIT) as proxy; CLOSE_WAIT needs /proc/net/tcp
			_ = line
		}
	}

	// More precise: count from /proc/net/tcp (state 0x08 = CLOSE_WAIT)
	tcpPath := getPath(extra, "proc_net_tcp", "/proc/net/tcp")
	if tcpData, err := os.ReadFile(tcpPath); err == nil {
		count = countTCPState(string(tcpData), "08")
	}

	return []EvidenceItem{{
		ItemID:     "ITEM0037",
		SchemaName: "evidence.system.tcp_close_wait.v1",
		Content: map[string]int{
			"close_wait_count": count,
		},
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0040: Page In/Out & Swapping ─────────────────────────────────────────

func collectVMStats(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	vmstatPath := getPath(extra, "proc_vmstat", "/proc/vmstat")
	data, err := os.ReadFile(vmstatPath)
	if err != nil {
		return nil, nil
	}
	fields := parseKeyValueLines(string(data), []string{
		"pgpgin", "pgpgout", "pswpin", "pswpout",
		"pgmajfault", "pgfault",
	})
	return []EvidenceItem{{
		ItemID:      "ITEM0040",
		SchemaName:  "evidence.system.vmstat.v1",
		Content:     fields,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0044: IPC parameters ──────────────────────────────────────────────────

func collectIPC(_ context.Context, _ map[string]string) ([]EvidenceItem, []EvidenceError) {
	out, err := exec.Command("ipcs", "-l").CombinedOutput()
	if err != nil {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0044",
		SchemaName:  "evidence.system.ipc_params.v1",
		Content:     map[string]string{"ipcs_l": truncate(string(out), 4096)},
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0063: Network routing & NFS ──────────────────────────────────────────

func collectRouting(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	data := map[string]string{}

	routePath := getPath(extra, "proc_net_route", "/proc/net/route")
	if content, err := os.ReadFile(routePath); err == nil {
		data["proc_net_route"] = truncate(string(content), 4096)
	}

	mountsPath := getPath(extra, "proc_mounts", "/proc/mounts")
	if content, err := os.ReadFile(mountsPath); err == nil {
		var nfsLines []string
		scanner := bufio.NewScanner(strings.NewReader(string(content)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "nfs") {
				nfsLines = append(nfsLines, line)
			}
		}
		data["nfs_mounts"] = strings.Join(nfsLines, "\n")
	}

	if len(data) == 0 {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0063",
		SchemaName:  "evidence.system.routing_nfs.v1",
		Content:     data,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0064: Disk / storage config ──────────────────────────────────────────

func collectDiskConfig(_ context.Context, _ map[string]string) ([]EvidenceItem, []EvidenceError) {
	out, err := exec.Command("lsblk", "-J").CombinedOutput()
	if err != nil {
		// lsblk may not be available; fall back silently
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0064",
		SchemaName:  "evidence.system.disk_config.v1",
		Content:     map[string]string{"lsblk_json": string(out)},
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0066: Running processes & services ────────────────────────────────────

func collectProcesses(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	procPath := getPath(extra, "proc_dir", "/proc")

	var zombies []string
	entries, err := os.ReadDir(procPath)
	if err != nil {
		return nil, nil
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		// /proc/<pid>/status
		statusPath := fmt.Sprintf("%s/%s/status", procPath, e.Name())
		status, err := os.ReadFile(statusPath)
		if err != nil {
			continue
		}
		if strings.Contains(string(status), "\nState:\tZ") {
			name := extractStatusField(string(status), "Name")
			zombies = append(zombies, fmt.Sprintf("%s (pid %s)", name, e.Name()))
		}
	}

	content := map[string]interface{}{
		"zombie_processes": zombies,
		"zombie_count":     len(zombies),
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0066",
		SchemaName:  "evidence.system.process_check.v1",
		Content:     content,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ── ITEM0070: Auto-restart config ─────────────────────────────────────────────

func collectAutoRestart(_ context.Context, extra map[string]string) ([]EvidenceItem, []EvidenceError) {
	data := map[string]interface{}{}

	// Check systemd Restart= directive for critical services
	services := []string{"nginx", "tomcat", "mysql", "postgresql", "redis"}
	systemdResults := map[string]string{}
	for _, svc := range services {
		out, err := exec.Command("systemctl", "show", svc, "--property=Restart,RestartSec").CombinedOutput()
		if err != nil {
			continue
		}
		systemdResults[svc] = strings.TrimSpace(string(out))
	}
	if len(systemdResults) > 0 {
		data["systemd"] = systemdResults
	}

	// PM2 ecosystem.json
	pm2Path := getPath(extra, "pm2_ecosystem", "/opt/app/ecosystem.json")
	if content, err := os.ReadFile(pm2Path); err == nil {
		data["pm2_ecosystem"] = truncate(string(content), 4096)
	}

	if len(data) == 0 {
		return nil, nil
	}
	return []EvidenceItem{{
		ItemID:      "ITEM0070",
		SchemaName:  "evidence.system.auto_restart_config.v1",
		Content:     data,
		CollectedAt: time.Now().UTC(),
	}}, nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func getPath(extra map[string]string, key, def string) string {
	if v, ok := extra[key]; ok {
		return v
	}
	return def
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…[truncated]"
}

func parseNetDev(content string) []map[string]string {
	var result []map[string]string
	scanner := bufio.NewScanner(strings.NewReader(content))
	for i := 0; scanner.Scan(); i++ {
		if i < 2 {
			continue // skip header lines
		}
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 10 {
			continue
		}
		iface := strings.TrimSuffix(parts[0], ":")
		result = append(result, map[string]string{
			"interface": iface,
			"rx_bytes":  parts[1],
			"tx_bytes":  parts[9],
		})
	}
	return result
}

func parseKeyValueLines(content string, keys []string) map[string]string {
	result := map[string]string{}
	want := make(map[string]bool, len(keys))
	for _, k := range keys {
		want[k] = true
	}
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) >= 2 && want[parts[0]] {
			result[parts[0]] = parts[1]
		}
	}
	return result
}

// countTCPState counts entries in /proc/net/tcp with the given hex state.
func countTCPState(content, state string) int {
	count := 0
	scanner := bufio.NewScanner(strings.NewReader(content))
	for i := 0; scanner.Scan(); i++ {
		if i == 0 {
			continue // header
		}
		parts := strings.Fields(scanner.Text())
		if len(parts) >= 4 && strings.EqualFold(parts[3], state) {
			count++
		}
	}
	return count
}

func extractStatusField(content, field string) string {
	prefix := field + ":"
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}
