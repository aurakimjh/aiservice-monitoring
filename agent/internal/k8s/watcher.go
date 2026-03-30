// Package k8s provides Kubernetes cluster monitoring for the AITOP Collection
// Server (WS-2.2).
//
// Components:
//   - Watcher  : Watches K8s API for Pods, Nodes, Deployments, Events
//   - Store    : In-memory entity store for K8s objects
//   - Handler  : HTTP endpoints for K8s dashboard
//   - Mapper   : Pod→Instance and Node→Host auto-mapping (E2-5, E2-6)
package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"
)

// ── Entity Models (E2-1) ─────────────────────────────────────────────────────

// Cluster represents a Kubernetes cluster.
type Cluster struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	APIServer  string    `json:"apiServer"`
	Version    string    `json:"version"`
	Status     string    `json:"status"` // healthy, degraded, unreachable
	NodeCount  int       `json:"nodeCount"`
	PodCount   int       `json:"podCount"`
	FirstSeen  time.Time `json:"firstSeen"`
	LastSeen   time.Time `json:"lastSeen"`
}

// Namespace represents a K8s namespace.
type Namespace struct {
	Name         string    `json:"name"`
	ClusterID    string    `json:"clusterId"`
	Status       string    `json:"status"` // Active, Terminating
	PodCount     int       `json:"podCount"`
	WorkloadCount int      `json:"workloadCount"`
	CreatedAt    time.Time `json:"createdAt"`
}

// Workload represents a Deployment, StatefulSet, or DaemonSet.
type Workload struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Namespace    string    `json:"namespace"`
	ClusterID    string    `json:"clusterId"`
	Kind         string    `json:"kind"` // Deployment, StatefulSet, DaemonSet
	Replicas     int       `json:"replicas"`
	ReadyReplicas int     `json:"readyReplicas"`
	Status       string    `json:"status"` // healthy, degraded, failed
	Labels       map[string]string `json:"labels,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Pod represents a K8s pod.
type Pod struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Namespace    string    `json:"namespace"`
	ClusterID    string    `json:"clusterId"`
	NodeName     string    `json:"nodeName"`
	WorkloadName string    `json:"workloadName"`
	WorkloadKind string    `json:"workloadKind"`
	Status       string    `json:"status"` // Running, Pending, Failed, Succeeded, Unknown
	PodIP        string    `json:"podIP"`
	RestartCount int       `json:"restartCount"`
	CPURequests  string    `json:"cpuRequests"`
	MemRequests  string    `json:"memRequests"`
	CPUUsage     float64   `json:"cpuUsage"`     // millicores
	MemUsage     float64   `json:"memUsageMB"`   // MB
	StartedAt    time.Time `json:"startedAt"`
	// E2-5: Mapped instance/service IDs.
	MappedServiceID  string `json:"mappedServiceId,omitempty"`
	MappedInstanceID string `json:"mappedInstanceId,omitempty"`
}

// Node represents a K8s node.
type Node struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	ClusterID       string    `json:"clusterId"`
	Status          string    `json:"status"` // Ready, NotReady, Unknown
	Roles           []string  `json:"roles"`
	KubeletVersion  string    `json:"kubeletVersion"`
	OSImage         string    `json:"osImage"`
	Architecture    string    `json:"architecture"`
	CPUCapacity     int       `json:"cpuCapacity"`     // total cores
	MemCapacityMB   int       `json:"memCapacityMB"`   // total MB
	CPUUsagePct     float64   `json:"cpuUsagePct"`
	MemUsagePct     float64   `json:"memUsagePct"`
	PodCount        int       `json:"podCount"`
	// E2-6: Mapped host/agent ID.
	MappedHostID string `json:"mappedHostId,omitempty"`
}

// Event represents a K8s event (warning/normal).
type Event struct {
	ID        string    `json:"id"`
	ClusterID string    `json:"clusterId"`
	Namespace string    `json:"namespace"`
	Kind      string    `json:"kind"`    // Pod, Node, Deployment
	Name      string    `json:"name"`    // object name
	Type      string    `json:"type"`    // Normal, Warning
	Reason    string    `json:"reason"`  // Pulled, Scheduled, OOMKilled, etc.
	Message   string    `json:"message"`
	Count     int       `json:"count"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
}

// ── K8s Store ────────────────────────────────────────────────────────────────

// Store holds all K8s entities in memory.
type Store struct {
	mu         sync.RWMutex
	clusters   map[string]*Cluster
	namespaces map[string]*Namespace   // key: clusterId/name
	workloads  map[string]*Workload    // key: clusterId/ns/name
	pods       map[string]*Pod         // key: clusterId/ns/podName
	nodes      map[string]*Node        // key: clusterId/nodeName
	events     []Event                 // ring buffer, last 500
	logger     *slog.Logger
}

const maxEvents = 500

// NewStore creates a K8s entity store.
func NewStore(logger *slog.Logger) *Store {
	return &Store{
		clusters:   make(map[string]*Cluster),
		namespaces: make(map[string]*Namespace),
		workloads:  make(map[string]*Workload),
		pods:       make(map[string]*Pod),
		nodes:      make(map[string]*Node),
		logger:     logger,
	}
}

// ── Upsert methods ───────────────────────────────────────────────────────────

func (s *Store) UpsertCluster(c *Cluster) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.clusters[c.ID]; ok {
		c.FirstSeen = existing.FirstSeen
	}
	c.LastSeen = time.Now().UTC()
	s.clusters[c.ID] = c
}

func (s *Store) UpsertNamespace(ns *Namespace) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := ns.ClusterID + "/" + ns.Name
	s.namespaces[key] = ns
}

func (s *Store) UpsertWorkload(w *Workload) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := w.ClusterID + "/" + w.Namespace + "/" + w.Name
	w.UpdatedAt = time.Now().UTC()
	if w.ReadyReplicas < w.Replicas {
		w.Status = "degraded"
	} else {
		w.Status = "healthy"
	}
	s.workloads[key] = w
}

func (s *Store) UpsertPod(p *Pod) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := p.ClusterID + "/" + p.Namespace + "/" + p.Name
	s.pods[key] = p
}

func (s *Store) UpsertNode(n *Node) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := n.ClusterID + "/" + n.Name
	s.nodes[key] = n
}

func (s *Store) AddEvent(e Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.events) >= maxEvents {
		s.events = s.events[1:]
	}
	s.events = append(s.events, e)
}

// ── Query methods ────────────────────────────────────────────────────────────

func (s *Store) ListClusters() []*Cluster {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Cluster, 0, len(s.clusters))
	for _, c := range s.clusters {
		cp := *c
		out = append(out, &cp)
	}
	return out
}

func (s *Store) GetCluster(id string) *Cluster {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if c, ok := s.clusters[id]; ok {
		cp := *c
		return &cp
	}
	return nil
}

func (s *Store) ListNamespaces(clusterID string) []*Namespace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Namespace
	for _, ns := range s.namespaces {
		if clusterID == "" || ns.ClusterID == clusterID {
			cp := *ns
			out = append(out, &cp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (s *Store) ListWorkloads(clusterID, namespace string) []*Workload {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Workload
	for _, w := range s.workloads {
		if clusterID != "" && w.ClusterID != clusterID {
			continue
		}
		if namespace != "" && w.Namespace != namespace {
			continue
		}
		cp := *w
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (s *Store) ListPods(clusterID, namespace, workload string) []*Pod {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Pod
	for _, p := range s.pods {
		if clusterID != "" && p.ClusterID != clusterID {
			continue
		}
		if namespace != "" && p.Namespace != namespace {
			continue
		}
		if workload != "" && p.WorkloadName != workload {
			continue
		}
		cp := *p
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (s *Store) ListNodes(clusterID string) []*Node {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Node
	for _, n := range s.nodes {
		if clusterID == "" || n.ClusterID == clusterID {
			cp := *n
			out = append(out, &cp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (s *Store) ListEvents(clusterID, namespace string, limit int) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Event
	for i := len(s.events) - 1; i >= 0; i-- {
		e := s.events[i]
		if clusterID != "" && e.ClusterID != clusterID {
			continue
		}
		if namespace != "" && e.Namespace != namespace {
			continue
		}
		out = append(out, e)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

// Stats returns aggregate cluster stats.
func (s *Store) Stats(clusterID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	nodeCount, podCount, workloadCount, nsCount := 0, 0, 0, 0
	runningPods, warningEvents := 0, 0

	for _, n := range s.nodes {
		if clusterID == "" || n.ClusterID == clusterID {
			nodeCount++
		}
	}
	for _, p := range s.pods {
		if clusterID == "" || p.ClusterID == clusterID {
			podCount++
			if p.Status == "Running" {
				runningPods++
			}
		}
	}
	for _, w := range s.workloads {
		if clusterID == "" || w.ClusterID == clusterID {
			workloadCount++
		}
	}
	for _, ns := range s.namespaces {
		if clusterID == "" || ns.ClusterID == clusterID {
			nsCount++
		}
	}
	for _, e := range s.events {
		if (clusterID == "" || e.ClusterID == clusterID) && e.Type == "Warning" {
			warningEvents++
		}
	}

	return map[string]interface{}{
		"nodes":         nodeCount,
		"pods":          podCount,
		"runningPods":   runningPods,
		"workloads":     workloadCount,
		"namespaces":    nsCount,
		"warningEvents": warningEvents,
	}
}

// ── E2-5/E2-6: Auto-mapping from OTel resource attributes ───────────────────

// MapFromOTelResource extracts K8s entities from OTel resource attributes
// and upserts them into the store. Called during trace/metric ingestion.
//
// Recognized attributes:
//   k8s.pod.name, k8s.namespace.name, k8s.node.name,
//   k8s.deployment.name, k8s.statefulset.name, k8s.daemonset.name,
//   k8s.cluster.name
func (s *Store) MapFromOTelResource(attrs map[string]string, serviceName string) {
	podName := attrs["k8s.pod.name"]
	if podName == "" {
		return // not running in K8s
	}

	clusterName := attrs["k8s.cluster.name"]
	if clusterName == "" {
		clusterName = "default"
	}
	namespace := attrs["k8s.namespace.name"]
	if namespace == "" {
		namespace = "default"
	}
	nodeName := attrs["k8s.node.name"]

	// Determine workload
	workloadName := attrs["k8s.deployment.name"]
	workloadKind := "Deployment"
	if workloadName == "" {
		workloadName = attrs["k8s.statefulset.name"]
		workloadKind = "StatefulSet"
	}
	if workloadName == "" {
		workloadName = attrs["k8s.daemonset.name"]
		workloadKind = "DaemonSet"
	}

	clusterID := "cluster-" + clusterName

	// Upsert cluster.
	s.UpsertCluster(&Cluster{
		ID:     clusterID,
		Name:   clusterName,
		Status: "healthy",
	})

	// Upsert namespace.
	s.UpsertNamespace(&Namespace{
		Name:      namespace,
		ClusterID: clusterID,
		Status:    "Active",
	})

	// Upsert workload.
	if workloadName != "" {
		s.UpsertWorkload(&Workload{
			ID:            fmt.Sprintf("wl-%s-%s-%s", clusterName, namespace, workloadName),
			Name:          workloadName,
			Namespace:     namespace,
			ClusterID:     clusterID,
			Kind:          workloadKind,
			Replicas:      1,
			ReadyReplicas: 1,
			CreatedAt:     time.Now().UTC(),
		})
	}

	// E2-5: Upsert pod with service mapping.
	s.UpsertPod(&Pod{
		ID:               fmt.Sprintf("pod-%s-%s-%s", clusterName, namespace, podName),
		Name:             podName,
		Namespace:        namespace,
		ClusterID:        clusterID,
		NodeName:         nodeName,
		WorkloadName:     workloadName,
		WorkloadKind:     workloadKind,
		Status:           "Running",
		StartedAt:        time.Now().UTC(),
		MappedServiceID:  serviceName,
		MappedInstanceID: podName,
	})

	// E2-6: Upsert node with host mapping.
	if nodeName != "" {
		s.UpsertNode(&Node{
			ID:           fmt.Sprintf("node-%s-%s", clusterName, nodeName),
			Name:         nodeName,
			ClusterID:    clusterID,
			Status:       "Ready",
			MappedHostID: nodeName,
		})
	}

	// Update cluster counts.
	s.mu.Lock()
	if c, ok := s.clusters[clusterID]; ok {
		c.NodeCount = len(s.nodes)
		c.PodCount = len(s.pods)
	}
	s.mu.Unlock()
}

// ── E2-2: Ingest kubelet/cAdvisor metrics ────────────────────────────────────

// IngestNodeMetrics updates a node with CPU/memory metrics from kubelet.
func (s *Store) IngestNodeMetrics(clusterID, nodeName string, cpuPct, memPct float64, cpuCap, memCapMB int) {
	key := clusterID + "/" + nodeName
	s.mu.Lock()
	defer s.mu.Unlock()
	n, ok := s.nodes[key]
	if !ok {
		n = &Node{
			ID:        fmt.Sprintf("node-%s-%s", clusterID, nodeName),
			Name:      nodeName,
			ClusterID: clusterID,
			Status:    "Ready",
		}
		s.nodes[key] = n
	}
	n.CPUCapacity = cpuCap
	n.MemCapacityMB = memCapMB
	n.CPUUsagePct = cpuPct
	n.MemUsagePct = memPct
}

// IngestPodMetrics updates a pod with CPU/memory usage from cAdvisor.
func (s *Store) IngestPodMetrics(clusterID, namespace, podName string, cpuMillis, memMB float64) {
	key := clusterID + "/" + namespace + "/" + podName
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.pods[key]
	if !ok {
		return // pod must exist from watcher or OTel mapping
	}
	p.CPUUsage = cpuMillis
	p.MemUsage = memMB
}

// ── Detect K8s environment ───────────────────────────────────────────────────

// IsRunningInK8s checks if the process is running inside a K8s pod.
func IsRunningInK8s() bool {
	_, err := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount/token")
	return err == nil
}

// GetServiceAccountToken reads the K8s service account token.
func GetServiceAccountToken() string {
	data, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")
	if err != nil {
		return ""
	}
	return string(data)
}

// GetKubeAPIServer returns the in-cluster API server URL.
func GetKubeAPIServer() string {
	host := os.Getenv("KUBERNETES_SERVICE_HOST")
	port := os.Getenv("KUBERNETES_SERVICE_PORT")
	if host == "" || port == "" {
		return ""
	}
	return fmt.Sprintf("https://%s:%s", host, port)
}

// ── Watcher (E2-3) ──────────────────────────────────────────────────────────

// Watcher watches the K8s API for Pod/Node/Deployment changes.
type Watcher struct {
	store      *Store
	apiServer  string
	token      string
	client     *http.Client
	logger     *slog.Logger
	clusterID  string
}

// NewWatcher creates a K8s API watcher. Returns nil if not in K8s.
func NewWatcher(store *Store, logger *slog.Logger) *Watcher {
	if !IsRunningInK8s() {
		logger.Info("k8s watcher: not running in Kubernetes, disabled")
		return nil
	}
	apiServer := GetKubeAPIServer()
	token := GetServiceAccountToken()
	if apiServer == "" {
		logger.Warn("k8s watcher: could not determine API server")
		return nil
	}

	clusterName := os.Getenv("AITOP_K8S_CLUSTER_NAME")
	if clusterName == "" {
		clusterName = "default"
	}

	return &Watcher{
		store:     store,
		apiServer: apiServer,
		token:     token,
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: nil, // uses in-cluster CA
			},
		},
		logger:    logger,
		clusterID: "cluster-" + clusterName,
	}
}

// Run starts the watcher loop. Blocks until ctx is cancelled.
func (w *Watcher) Run(ctx context.Context) {
	w.logger.Info("k8s watcher started", "apiServer", w.apiServer, "cluster", w.clusterID)

	// Initial sync.
	w.syncAll()

	// Periodic re-sync every 30 seconds.
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.logger.Info("k8s watcher stopped")
			return
		case <-ticker.C:
			w.syncAll()
		}
	}
}

func (w *Watcher) syncAll() {
	w.syncNodes()
	w.syncPods()
	w.syncDeployments()
}

func (w *Watcher) syncNodes() {
	data, err := w.apiGet("/api/v1/nodes")
	if err != nil {
		w.logger.Debug("k8s sync nodes failed", "error", err)
		return
	}
	var resp struct {
		Items []struct {
			Metadata struct {
				Name   string            `json:"name"`
				Labels map[string]string `json:"labels"`
			} `json:"metadata"`
			Status struct {
				Conditions []struct {
					Type   string `json:"type"`
					Status string `json:"status"`
				} `json:"conditions"`
				NodeInfo struct {
					KubeletVersion          string `json:"kubeletVersion"`
					OSImage                 string `json:"osImage"`
					Architecture            string `json:"architecture"`
				} `json:"nodeInfo"`
				Capacity struct {
					CPU    string `json:"cpu"`
					Memory string `json:"memory"`
				} `json:"capacity"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return
	}

	for _, item := range resp.Items {
		status := "Unknown"
		for _, cond := range item.Status.Conditions {
			if cond.Type == "Ready" {
				if cond.Status == "True" {
					status = "Ready"
				} else {
					status = "NotReady"
				}
			}
		}
		var roles []string
		for k := range item.Metadata.Labels {
			if k == "node-role.kubernetes.io/master" || k == "node-role.kubernetes.io/control-plane" {
				roles = append(roles, "control-plane")
			}
			if k == "node-role.kubernetes.io/worker" {
				roles = append(roles, "worker")
			}
		}
		if len(roles) == 0 {
			roles = []string{"worker"}
		}

		w.store.UpsertNode(&Node{
			ID:             fmt.Sprintf("node-%s-%s", w.clusterID, item.Metadata.Name),
			Name:           item.Metadata.Name,
			ClusterID:      w.clusterID,
			Status:         status,
			Roles:          roles,
			KubeletVersion: item.Status.NodeInfo.KubeletVersion,
			OSImage:        item.Status.NodeInfo.OSImage,
			Architecture:   item.Status.NodeInfo.Architecture,
			MappedHostID:   item.Metadata.Name,
		})
	}
}

func (w *Watcher) syncPods() {
	data, err := w.apiGet("/api/v1/pods")
	if err != nil {
		w.logger.Debug("k8s sync pods failed", "error", err)
		return
	}
	var resp struct {
		Items []struct {
			Metadata struct {
				Name      string `json:"name"`
				Namespace string `json:"namespace"`
				OwnerReferences []struct {
					Kind string `json:"kind"`
					Name string `json:"name"`
				} `json:"ownerReferences"`
			} `json:"metadata"`
			Spec struct {
				NodeName string `json:"nodeName"`
			} `json:"spec"`
			Status struct {
				Phase string `json:"phase"`
				PodIP string `json:"podIP"`
				ContainerStatuses []struct {
					RestartCount int `json:"restartCount"`
				} `json:"containerStatuses"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return
	}

	for _, item := range resp.Items {
		restarts := 0
		for _, cs := range item.Status.ContainerStatuses {
			restarts += cs.RestartCount
		}
		workloadName, workloadKind := "", ""
		for _, ref := range item.Metadata.OwnerReferences {
			if ref.Kind == "ReplicaSet" || ref.Kind == "StatefulSet" || ref.Kind == "DaemonSet" {
				workloadName = ref.Name
				workloadKind = ref.Kind
			}
		}

		w.store.UpsertPod(&Pod{
			ID:           fmt.Sprintf("pod-%s-%s-%s", w.clusterID, item.Metadata.Namespace, item.Metadata.Name),
			Name:         item.Metadata.Name,
			Namespace:    item.Metadata.Namespace,
			ClusterID:    w.clusterID,
			NodeName:     item.Spec.NodeName,
			WorkloadName: workloadName,
			WorkloadKind: workloadKind,
			Status:       item.Status.Phase,
			PodIP:        item.Status.PodIP,
			RestartCount: restarts,
		})
	}
}

func (w *Watcher) syncDeployments() {
	data, err := w.apiGet("/apis/apps/v1/deployments")
	if err != nil {
		w.logger.Debug("k8s sync deployments failed", "error", err)
		return
	}
	var resp struct {
		Items []struct {
			Metadata struct {
				Name      string            `json:"name"`
				Namespace string            `json:"namespace"`
				Labels    map[string]string `json:"labels"`
			} `json:"metadata"`
			Spec struct {
				Replicas int `json:"replicas"`
			} `json:"spec"`
			Status struct {
				ReadyReplicas int `json:"readyReplicas"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return
	}

	for _, item := range resp.Items {
		w.store.UpsertWorkload(&Workload{
			ID:            fmt.Sprintf("wl-%s-%s-%s", w.clusterID, item.Metadata.Namespace, item.Metadata.Name),
			Name:          item.Metadata.Name,
			Namespace:     item.Metadata.Namespace,
			ClusterID:     w.clusterID,
			Kind:          "Deployment",
			Replicas:      item.Spec.Replicas,
			ReadyReplicas: item.Status.ReadyReplicas,
			Labels:        item.Metadata.Labels,
			CreatedAt:     time.Now().UTC(),
		})
	}
}

func (w *Watcher) apiGet(path string) ([]byte, error) {
	req, err := http.NewRequest("GET", w.apiServer+path, nil)
	if err != nil {
		return nil, err
	}
	if w.token != "" {
		req.Header.Set("Authorization", "Bearer "+w.token)
	}
	resp, err := w.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("k8s API %s: %d", path, resp.StatusCode)
	}
	var buf [512 * 1024]byte // 512KB max
	n, _ := resp.Body.Read(buf[:])
	return buf[:n], nil
}
