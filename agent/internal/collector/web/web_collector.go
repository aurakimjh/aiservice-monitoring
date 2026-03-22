// Package web provides a Collector for web server configurations and status.
// Supports Nginx, Apache (httpd), and IIS.
package web

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers web server configuration, status, and SSL certificate info.
type Collector struct{}

// New returns a new WEB Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "web" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "windows", "darwin"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "read", Target: "/etc/nginx", Description: "read Nginx configuration files"},
		{Type: "read", Target: "/etc/apache2", Description: "read Apache2 configuration files"},
		{Type: "exec", Target: "nginx -V", Description: "get Nginx version and compile options"},
		{Type: "net", Target: "localhost:80", Description: "access web server status page"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"web.server_info.v1",
		"web.config_summary.v1",
		"web.ssl_certificates.v1",
		"web.status_metrics.v1",
	}
}

// serverType represents a detected web server.
type serverType struct {
	Name       string // "nginx", "apache", "iis"
	Process    string // process name
	ConfigPath string
	StatusURL  string
}

func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	srv := detectWebServer()
	if srv == nil {
		return models.DetectResult{Detected: false}, nil
	}
	return models.DetectResult{
		Detected: true,
		Details:  map[string]string{"server": srv.Name, "process": srv.Process},
	}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	srv := detectWebServer()
	if srv == nil {
		result.Status = models.StatusSkipped
		result.Errors = []models.CollectError{{
			Code:    models.ErrEnvNotDetected,
			Message: "no supported web server (nginx/apache/iis) detected",
		}}
		result.Duration = time.Since(start)
		return result, nil
	}

	var errs []models.CollectError

	// Server info
	if item, err := c.collectServerInfo(srv); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("server info: %v", err),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// Config summary
	if item, err := c.collectConfigSummary(srv); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("config summary: %v", err),
			Command: fmt.Sprintf("read %s", srv.ConfigPath),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// SSL certificates
	if item, err := c.collectSSLCerts(srv); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("ssl certs: %v", err),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// Status page metrics
	if item, err := c.collectStatusMetrics(ctx, srv); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("status metrics: %v", err),
			Command: fmt.Sprintf("GET %s", srv.StatusURL),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	result.Errors = errs
	result.Duration = time.Since(start)

	if len(errs) > 0 && len(result.Items) == 0 {
		result.Status = models.StatusFailed
	} else if len(errs) > 0 {
		result.Status = models.StatusPartial
	}
	return result, nil
}

// detectWebServer probes processes and config paths to find an active web server.
func detectWebServer() *serverType {
	candidates := []serverType{
		{Name: "nginx", Process: "nginx", ConfigPath: "/etc/nginx/nginx.conf", StatusURL: "http://localhost/nginx_status"},
		{Name: "apache", Process: "apache2", ConfigPath: "/etc/apache2/apache2.conf", StatusURL: "http://localhost/server-status?auto"},
		{Name: "apache", Process: "httpd", ConfigPath: "/etc/httpd/conf/httpd.conf", StatusURL: "http://localhost/server-status?auto"},
	}

	// Windows IIS
	if runtime.GOOS == "windows" {
		candidates = append(candidates, serverType{
			Name: "iis", Process: "w3wp", ConfigPath: `C:\Windows\System32\inetsrv\config\applicationHost.config`,
			StatusURL: "http://localhost/",
		})
	}

	for _, cand := range candidates {
		srv := cand
		if isProcessRunning(srv.Process) {
			// Resolve actual config path
			srv.ConfigPath = resolveConfigPath(srv.Name, srv.ConfigPath)
			return &srv
		}
	}
	return nil
}

// isProcessRunning checks if a process with the given name is currently running.
func isProcessRunning(name string) bool {
	if runtime.GOOS == "linux" {
		entries, err := os.ReadDir("/proc")
		if err != nil {
			return false
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			if _, err := strconv.Atoi(e.Name()); err != nil {
				continue
			}
			commPath := filepath.Join("/proc", e.Name(), "comm")
			data, err := os.ReadFile(commPath)
			if err != nil {
				continue
			}
			if strings.TrimSpace(string(data)) == name {
				return true
			}
		}
		return false
	}

	// Fallback: use 'pgrep' on linux/darwin, 'tasklist' on Windows
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("tasklist", "/FI", fmt.Sprintf("IMAGENAME eq %s.exe", name), "/NH")
	} else {
		cmd = exec.Command("pgrep", "-x", name)
	}
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), name)
}

// resolveConfigPath returns the actual config path, checking common alternatives.
func resolveConfigPath(serverName, defaultPath string) string {
	if _, err := os.Stat(defaultPath); err == nil {
		return defaultPath
	}
	alternatives := map[string][]string{
		"nginx":  {"/etc/nginx/nginx.conf", "/usr/local/nginx/conf/nginx.conf", "/usr/local/etc/nginx/nginx.conf"},
		"apache": {"/etc/apache2/apache2.conf", "/etc/httpd/conf/httpd.conf", "/usr/local/apache2/conf/httpd.conf"},
	}
	for _, alt := range alternatives[serverName] {
		if _, err := os.Stat(alt); err == nil {
			return alt
		}
	}
	return defaultPath
}

// collectServerInfo collects version, binary path, and compile options.
func (c *Collector) collectServerInfo(srv *serverType) (*models.CollectedItem, error) {
	info := map[string]interface{}{
		"server_type": srv.Name,
		"process":     srv.Process,
		"config_path": srv.ConfigPath,
	}

	var versionCmd *exec.Cmd
	switch srv.Name {
	case "nginx":
		versionCmd = exec.Command("nginx", "-V")
	case "apache":
		bin := "apache2"
		if srv.Process == "httpd" {
			bin = "httpd"
		}
		versionCmd = exec.Command(bin, "-V")
	}

	if versionCmd != nil {
		// nginx -V writes to stderr
		out, err := versionCmd.CombinedOutput()
		if err == nil {
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "nginx version:") {
					info["version"] = strings.TrimPrefix(line, "nginx version: ")
				} else if strings.HasPrefix(line, "Server version:") {
					info["version"] = strings.TrimPrefix(line, "Server version: ")
				} else if strings.HasPrefix(line, "configure arguments:") {
					info["configure_args"] = strings.TrimPrefix(line, "configure arguments: ")
				}
			}
		}
	}

	return &models.CollectedItem{
		SchemaName:    "web.server_info",
		SchemaVersion: "1.0.0",
		MetricType:    "web_server_info",
		Category:      "it",
		Data:          info,
	}, nil
}

// collectConfigSummary parses the web server config for key settings.
func (c *Collector) collectConfigSummary(srv *serverType) (*models.CollectedItem, error) {
	data := map[string]interface{}{
		"config_path": srv.ConfigPath,
	}

	f, err := os.Open(srv.ConfigPath)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", srv.ConfigPath, err)
	}
	defer f.Close()

	switch srv.Name {
	case "nginx":
		parseNginxConfig(f, data)
	case "apache":
		parseApacheConfig(f, data)
	}

	return &models.CollectedItem{
		SchemaName:    "web.config_summary",
		SchemaVersion: "1.0.0",
		MetricType:    "web_config_summary",
		Category:      "it",
		Data:          data,
	}, nil
}

// parseNginxConfig extracts key directives from nginx.conf.
func parseNginxConfig(f *os.File, data map[string]interface{}) {
	scanner := bufio.NewScanner(f)
	var workerProcesses, workerConnections, keepaliveTimeout string
	var serverNames []string
	var listenPorts []string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := fields[0]
		val := strings.TrimSuffix(strings.Join(fields[1:], " "), ";")

		switch key {
		case "worker_processes":
			workerProcesses = val
		case "worker_connections":
			workerConnections = val
		case "keepalive_timeout":
			keepaliveTimeout = val
		case "server_name":
			for _, sn := range fields[1:] {
				sn = strings.TrimSuffix(sn, ";")
				if sn != "_" && sn != "" {
					serverNames = append(serverNames, sn)
				}
			}
		case "listen":
			port := strings.TrimSuffix(fields[1], ";")
			port = strings.TrimSuffix(port, " ssl")
			port = strings.Fields(port)[0]
			listenPorts = append(listenPorts, port)
		}
	}

	if workerProcesses != "" {
		data["worker_processes"] = workerProcesses
	}
	if workerConnections != "" {
		data["worker_connections"] = workerConnections
	}
	if keepaliveTimeout != "" {
		data["keepalive_timeout"] = keepaliveTimeout
	}
	if len(serverNames) > 0 {
		data["server_names"] = unique(serverNames)
	}
	if len(listenPorts) > 0 {
		data["listen_ports"] = unique(listenPorts)
	}
}

// parseApacheConfig extracts key directives from httpd.conf / apache2.conf.
func parseApacheConfig(f *os.File, data map[string]interface{}) {
	scanner := bufio.NewScanner(f)
	var serverName, serverAdmin, documentRoot, listenPorts []string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := strings.ToLower(fields[0])
		val := strings.Join(fields[1:], " ")

		switch key {
		case "servername":
			serverName = append(serverName, val)
		case "serveradmin":
			serverAdmin = append(serverAdmin, val)
		case "documentroot":
			documentRoot = append(documentRoot, strings.Trim(val, `"`))
		case "listen":
			listenPorts = append(listenPorts, val)
		}
	}

	if len(serverName) > 0 {
		data["server_name"] = unique(serverName)
	}
	if len(serverAdmin) > 0 {
		data["server_admin"] = unique(serverAdmin)
	}
	if len(documentRoot) > 0 {
		data["document_root"] = unique(documentRoot)
	}
	if len(listenPorts) > 0 {
		data["listen_ports"] = unique(listenPorts)
	}
}

// certInfo holds SSL certificate details.
type certInfo struct {
	Host      string `json:"host"`
	Port      string `json:"port"`
	Subject   string `json:"subject"`
	Issuer    string `json:"issuer"`
	NotBefore string `json:"not_before"`
	NotAfter  string `json:"not_after"`
	DaysLeft  int    `json:"days_left"`
	Expired   bool   `json:"expired"`
}

// collectSSLCerts scans config for SSL certificates and checks expiry.
func (c *Collector) collectSSLCerts(srv *serverType) (*models.CollectedItem, error) {
	// Find HTTPS ports by scanning config
	ports := sslPortsFromConfig(srv)

	var certs []certInfo
	now := time.Now()

	for _, port := range ports {
		host := "localhost"
		ci, err := checkSSLCert(host, port)
		if err != nil {
			// Record as expired/unknown rather than failing
			certs = append(certs, certInfo{
				Host:    host,
				Port:    port,
				Subject: fmt.Sprintf("error: %v", err),
				Expired: true,
			})
			continue
		}
		ci.certInfo.DaysLeft = int(ci.expiry.Sub(now).Hours() / 24)
		ci.certInfo.Expired = now.After(ci.expiry)
		certs = append(certs, ci.certInfo)
	}

	return &models.CollectedItem{
		SchemaName:    "web.ssl_certificates",
		SchemaVersion: "1.0.0",
		MetricType:    "web_ssl_certs",
		Category:      "it",
		Data: map[string]interface{}{
			"cert_count":   len(certs),
			"certificates": certs,
		},
	}, nil
}

// certInfoInternal extends certInfo with the parsed expiry time.
type certInfoInternal struct {
	certInfo
	expiry time.Time
}

func checkSSLCert(host, port string) (*certInfoInternal, error) {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(host, port), &tls.Config{
		InsecureSkipVerify: true, //nolint:gosec — intentional for inventory checks
	})
	if err != nil {
		return nil, fmt.Errorf("tls dial %s:%s: %w", host, port, err)
	}
	defer conn.Close()

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return nil, fmt.Errorf("no certificates returned from %s:%s", host, port)
	}

	leaf := certs[0]
	return &certInfoInternal{
		certInfo: certInfo{
			Host:      host,
			Port:      port,
			Subject:   leaf.Subject.CommonName,
			Issuer:    leaf.Issuer.CommonName,
			NotBefore: leaf.NotBefore.UTC().Format(time.RFC3339),
			NotAfter:  leaf.NotAfter.UTC().Format(time.RFC3339),
		},
		expiry: leaf.NotAfter,
	}, nil
}

// sslPortsFromConfig reads the config file and extracts HTTPS listen ports.
func sslPortsFromConfig(srv *serverType) []string {
	f, err := os.Open(srv.ConfigPath)
	if err != nil {
		return []string{"443"}
	}
	defer f.Close()

	var ports []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := strings.ToLower(fields[0])
		if key != "listen" {
			continue
		}
		val := strings.TrimSuffix(fields[1], ";")
		rest := strings.Join(fields[2:], " ")
		if strings.Contains(rest, "ssl") || strings.Contains(val, "443") || strings.Contains(rest, "https") {
			port := extractPort(val)
			if port != "" {
				ports = append(ports, port)
			}
		}
	}

	if len(ports) == 0 {
		return []string{"443"}
	}
	return unique(ports)
}

func extractPort(val string) string {
	// val may be "443", "0.0.0.0:443", "[::]:8443"
	if _, _, err := net.SplitHostPort(val); err == nil {
		_, port, _ := net.SplitHostPort(val)
		return port
	}
	return val
}

// nginxStatusMetrics holds parsed nginx_status page data.
type nginxStatusMetrics struct {
	ActiveConnections int `json:"active_connections"`
	Accepts           int `json:"accepts"`
	Handled           int `json:"handled"`
	Requests          int `json:"requests"`
	Reading           int `json:"reading"`
	Writing           int `json:"writing"`
	Waiting           int `json:"waiting"`
}

// collectStatusMetrics fetches the web server status page.
func (c *Collector) collectStatusMetrics(ctx context.Context, srv *serverType) (*models.CollectedItem, error) {
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, srv.StatusURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("status page GET %s: %w", srv.StatusURL, err)
	}
	defer resp.Body.Close()

	data := map[string]interface{}{
		"status_url":  srv.StatusURL,
		"http_status": resp.StatusCode,
	}

	if srv.Name == "nginx" {
		metrics := parseNginxStatus(resp)
		data["active_connections"] = metrics.ActiveConnections
		data["accepts"] = metrics.Accepts
		data["handled"] = metrics.Handled
		data["requests"] = metrics.Requests
		data["reading"] = metrics.Reading
		data["writing"] = metrics.Writing
		data["waiting"] = metrics.Waiting
	}

	return &models.CollectedItem{
		SchemaName:    "web.status_metrics",
		SchemaVersion: "1.0.0",
		MetricType:    "web_status_metrics",
		Category:      "it",
		Data:          data,
	}, nil
}

// parseNginxStatus parses the nginx stub_status page.
// Format:
//
//	Active connections: 1
//	server accepts handled requests
//	 3 3 4
//	Reading: 0 Writing: 1 Waiting: 0
func parseNginxStatus(resp *http.Response) nginxStatusMetrics {
	var m nginxStatusMetrics
	scanner := bufio.NewScanner(resp.Body)
	lineNum := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		lineNum++
		switch lineNum {
		case 1:
			if strings.HasPrefix(line, "Active connections:") {
				fmt.Sscanf(strings.TrimPrefix(line, "Active connections:"), " %d", &m.ActiveConnections)
			}
		case 3:
			fmt.Sscanf(line, "%d %d %d", &m.Accepts, &m.Handled, &m.Requests)
		case 4:
			fmt.Sscanf(line, "Reading: %d Writing: %d Waiting: %d", &m.Reading, &m.Writing, &m.Waiting)
		}
	}
	return m
}

// unique deduplicates a string slice while preserving order.
func unique(ss []string) []string {
	seen := make(map[string]bool)
	var out []string
	for _, s := range ss {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
