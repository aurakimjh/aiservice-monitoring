package k8s

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
)

// Handler exposes K8s entities via HTTP.
//
// Routes:
//   GET /api/v2/k8s/clusters                           — list clusters
//   GET /api/v2/k8s/clusters/{id}                      — cluster detail
//   GET /api/v2/k8s/clusters/{id}/stats                — cluster stats
//   GET /api/v2/k8s/clusters/{id}/namespaces           — list namespaces
//   GET /api/v2/k8s/clusters/{id}/workloads            — list workloads
//   GET /api/v2/k8s/clusters/{id}/pods                 — list pods
//   GET /api/v2/k8s/clusters/{id}/nodes                — list nodes
//   GET /api/v2/k8s/clusters/{id}/events               — list events
//   GET /api/v2/k8s/pods                               — all pods (cross-cluster)
//   GET /api/v2/k8s/nodes                              — all nodes (cross-cluster)
type Handler struct {
	store  *Store
	logger *slog.Logger
}

// NewHandler creates a K8s HTTP handler.
func NewHandler(store *Store, logger *slog.Logger) *Handler {
	return &Handler{store: store, logger: logger}
}

// Register attaches routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v2/k8s/clusters/{id}/stats", h.handleClusterStats)
	mux.HandleFunc("GET /api/v2/k8s/clusters/{id}/namespaces", h.handleNamespaces)
	mux.HandleFunc("GET /api/v2/k8s/clusters/{id}/workloads", h.handleWorkloads)
	mux.HandleFunc("GET /api/v2/k8s/clusters/{id}/pods", h.handlePods)
	mux.HandleFunc("GET /api/v2/k8s/clusters/{id}/nodes", h.handleNodes)
	mux.HandleFunc("GET /api/v2/k8s/clusters/{id}/events", h.handleEvents)
	mux.HandleFunc("GET /api/v2/k8s/clusters/{id}", h.handleGetCluster)
	mux.HandleFunc("GET /api/v2/k8s/clusters", h.handleListClusters)
	mux.HandleFunc("GET /api/v2/k8s/pods", h.handleAllPods)
	mux.HandleFunc("GET /api/v2/k8s/nodes", h.handleAllNodes)
}

func (h *Handler) handleListClusters(w http.ResponseWriter, r *http.Request) {
	clusters := h.store.ListClusters()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"clusters": clusters,
		"count":    len(clusters),
	})
}

func (h *Handler) handleGetCluster(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c := h.store.GetCluster(id)
	if c == nil {
		writeErr(w, http.StatusNotFound, "cluster not found")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *Handler) handleClusterStats(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	stats := h.store.Stats(id)
	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) handleNamespaces(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	nss := h.store.ListNamespaces(id)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"namespaces": nss,
		"count":      len(nss),
	})
}

func (h *Handler) handleWorkloads(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ns := r.URL.Query().Get("namespace")
	wls := h.store.ListWorkloads(id, ns)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"workloads": wls,
		"count":     len(wls),
	})
}

func (h *Handler) handlePods(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ns := r.URL.Query().Get("namespace")
	workload := r.URL.Query().Get("workload")
	pods := h.store.ListPods(id, ns, workload)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"pods":  pods,
		"count": len(pods),
	})
}

func (h *Handler) handleNodes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	nodes := h.store.ListNodes(id)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"nodes": nodes,
		"count": len(nodes),
	})
}

func (h *Handler) handleEvents(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ns := r.URL.Query().Get("namespace")
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	events := h.store.ListEvents(id, ns, limit)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"count":  len(events),
	})
}

func (h *Handler) handleAllPods(w http.ResponseWriter, r *http.Request) {
	pods := h.store.ListPods("", "", "")
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"pods":  pods,
		"count": len(pods),
	})
}

func (h *Handler) handleAllNodes(w http.ResponseWriter, r *http.Request) {
	nodes := h.store.ListNodes("")
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"nodes": nodes,
		"count": len(nodes),
	})
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
