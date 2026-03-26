#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# k8s-deploy.sh — AITOP Kubernetes 배포 자동화 스크립트
#
# 사용법:
#   ./scripts/k8s-deploy.sh setup      # kind 클러스터 생성 + 인프라 설치
#   ./scripts/k8s-deploy.sh build      # Docker 이미지 빌드 + kind 로드
#   ./scripts/k8s-deploy.sh deploy      # Helm 차트 배포 (dev)
#   ./scripts/k8s-deploy.sh deploy-prod # Helm 차트 배포 (prod)
#   ./scripts/k8s-deploy.sh dry-run     # Helm dry-run (템플릿 검증)
#   ./scripts/k8s-deploy.sh status      # Pod 상태 확인
#   ./scripts/k8s-deploy.sh logs        # 주요 서비스 로그
#   ./scripts/k8s-deploy.sh teardown    # 클러스터 삭제
#   ./scripts/k8s-deploy.sh all         # setup + build + deploy
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

CLUSTER_NAME="aitop"
NAMESPACE="monitoring"
CHART_PATH="./helm/aiservice-monitoring"
RELEASE_NAME="aitop"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${GREEN}[AITOP]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info()  { echo -e "${BLUE}[INFO]${NC} $*"; }

# ── Prerequisites check ──────────────────────────────────────────────────
check_prereqs() {
    local missing=()
    for cmd in kind kubectl helm docker; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing required tools: ${missing[*]}"
        echo "Install with:"
        echo "  choco install kind kubernetes-cli kubernetes-helm docker-desktop"
        exit 1
    fi
    log "Prerequisites OK: kind, kubectl, helm, docker"
}

# ── Cluster setup ────────────────────────────────────────────────────────
cmd_setup() {
    log "Creating kind cluster '$CLUSTER_NAME' (4 nodes)..."
    if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
        warn "Cluster '$CLUSTER_NAME' already exists. Skipping creation."
    else
        kind create cluster --name "$CLUSTER_NAME" \
            --config "$ROOT_DIR/infra/kubernetes/kind-config.yaml" \
            --wait 120s
        log "Cluster created."
    fi

    kubectl cluster-info --context "kind-${CLUSTER_NAME}"
    kubectl get nodes -o wide

    # Create namespace
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    log "Namespace '$NAMESPACE' ready."

    # Install NGINX Ingress Controller for kind
    log "Installing NGINX Ingress Controller..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml 2>/dev/null || true
    log "Waiting for Ingress controller..."
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=120s 2>/dev/null || warn "Ingress controller not ready yet (non-blocking)"

    log "Cluster setup complete."
    echo ""
    kubectl get nodes
}

# ── Docker image build ───────────────────────────────────────────────────
cmd_build() {
    log "Building Docker images..."

    # Collection Server
    log "  Building aitop/collection-server..."
    docker build \
        -f "$ROOT_DIR/infra/docker/Dockerfile.collection-server" \
        -t aitop/collection-server:1.0.0 \
        "$ROOT_DIR/agent"

    # Frontend
    log "  Building aitop/frontend..."
    docker build \
        -t aitop/frontend:1.0.0 \
        "$ROOT_DIR/frontend"

    # Load images into kind cluster
    log "Loading images into kind cluster..."
    kind load docker-image aitop/collection-server:1.0.0 --name "$CLUSTER_NAME"
    kind load docker-image aitop/frontend:1.0.0 --name "$CLUSTER_NAME"

    log "Docker images built and loaded."
}

# ── Helm deploy (dev) ────────────────────────────────────────────────────
cmd_deploy() {
    log "Deploying AITOP (dev mode)..."

    helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" \
        -f "$CHART_PATH/values-dev.yaml" \
        -n "$NAMESPACE" --create-namespace \
        --wait --timeout 5m

    log "Deploy complete. Checking pods..."
    kubectl get pods -n "$NAMESPACE" -o wide
    echo ""
    log "Services:"
    kubectl get svc -n "$NAMESPACE"
    echo ""
    log "Ingress:"
    kubectl get ingress -n "$NAMESPACE"
}

# ── Helm deploy (prod) ──────────────────────────────────────────────────
cmd_deploy_prod() {
    log "Deploying AITOP (production mode)..."

    helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" \
        -f "$CHART_PATH/values-prod.yaml" \
        -n "$NAMESPACE" --create-namespace \
        --wait --timeout 10m

    log "Production deploy complete."
    kubectl get pods -n "$NAMESPACE" -o wide
}

# ── Helm dry-run ─────────────────────────────────────────────────────────
cmd_dry_run() {
    local values_file="${1:-$CHART_PATH/values-dev.yaml}"
    log "Running Helm dry-run with $values_file..."

    helm install "$RELEASE_NAME" "$CHART_PATH" \
        -f "$values_file" \
        -n "$NAMESPACE" \
        --dry-run --debug 2>&1 | head -200

    log "Dry-run complete (showing first 200 lines)."
    echo ""
    log "Full dry-run: helm install $RELEASE_NAME $CHART_PATH -f $values_file -n $NAMESPACE --dry-run --debug"
}

# ── Status ───────────────────────────────────────────────────────────────
cmd_status() {
    log "=== Nodes ==="
    kubectl get nodes -o wide
    echo ""
    log "=== Pods ($NAMESPACE) ==="
    kubectl get pods -n "$NAMESPACE" -o wide
    echo ""
    log "=== Services ($NAMESPACE) ==="
    kubectl get svc -n "$NAMESPACE"
    echo ""
    log "=== Ingress ($NAMESPACE) ==="
    kubectl get ingress -n "$NAMESPACE" 2>/dev/null || echo "  No ingress resources"
    echo ""
    log "=== HPA ($NAMESPACE) ==="
    kubectl get hpa -n "$NAMESPACE" 2>/dev/null || echo "  No HPA resources"
    echo ""
    log "=== PVC ($NAMESPACE) ==="
    kubectl get pvc -n "$NAMESPACE" 2>/dev/null || echo "  No PVCs"
}

# ── Logs ─────────────────────────────────────────────────────────────────
cmd_logs() {
    local component="${1:-collection-server}"
    log "Showing logs for component: $component"
    kubectl logs -n "$NAMESPACE" -l "app.kubernetes.io/component=$component" \
        --tail=50 --all-containers
}

# ── Teardown ─────────────────────────────────────────────────────────────
cmd_teardown() {
    warn "Deleting kind cluster '$CLUSTER_NAME'..."
    kind delete cluster --name "$CLUSTER_NAME"
    log "Cluster deleted."
}

# ── All ──────────────────────────────────────────────────────────────────
cmd_all() {
    check_prereqs
    cmd_setup
    cmd_build
    cmd_deploy
    echo ""
    log "=========================================="
    log "  AITOP deployed successfully!"
    log "=========================================="
    log ""
    log "  Frontend:  http://localhost:80"
    log "  API:       http://localhost:80/api"
    log "  Grafana:   kubectl port-forward -n $NAMESPACE svc/${RELEASE_NAME}-grafana 3001:80"
    log ""
    cmd_status
}

# ── Main ─────────────────────────────────────────────────────────────────
case "${1:-help}" in
    setup)        check_prereqs; cmd_setup ;;
    build)        check_prereqs; cmd_build ;;
    deploy)       cmd_deploy ;;
    deploy-prod)  cmd_deploy_prod ;;
    dry-run)      cmd_dry_run "${2:-}" ;;
    status)       cmd_status ;;
    logs)         cmd_logs "${2:-collection-server}" ;;
    teardown)     cmd_teardown ;;
    all)          cmd_all ;;
    *)
        echo "Usage: $0 {setup|build|deploy|deploy-prod|dry-run|status|logs|teardown|all}"
        echo ""
        echo "Commands:"
        echo "  setup        Create kind cluster + install ingress controller"
        echo "  build        Build Docker images + load into kind"
        echo "  deploy       Helm install/upgrade (dev)"
        echo "  deploy-prod  Helm install/upgrade (prod)"
        echo "  dry-run      Helm template validation (no install)"
        echo "  status       Show cluster status"
        echo "  logs [comp]  Show logs (default: collection-server)"
        echo "  teardown     Delete kind cluster"
        echo "  all          setup + build + deploy"
        ;;
esac
