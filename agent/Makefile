APP_NAME := aitop-agent
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "0.1.0-dev")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GO_VERSION := $(shell go version | awk '{print $$3}')

LDFLAGS := -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.Version=$(VERSION) \
           -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.GitCommit=$(GIT_COMMIT) \
           -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.BuildDate=$(BUILD_DATE) \
           -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.GoVersion=$(GO_VERSION)

.PHONY: build build-linux build-windows build-collection-server test clean run lint package

## build: Build for current platform
build:
	go build -ldflags "$(LDFLAGS)" -o bin/$(APP_NAME) ./cmd/aitop-agent

## build-linux: Cross-compile for Linux amd64
build-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/$(APP_NAME)-linux-amd64 ./cmd/aitop-agent

## build-linux-arm64: Cross-compile for Linux arm64
build-linux-arm64:
	GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/$(APP_NAME)-linux-arm64 ./cmd/aitop-agent

## build-windows: Cross-compile for Windows amd64
build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/$(APP_NAME)-windows-amd64.exe ./cmd/aitop-agent

## build-collection-server: Build the collection server binary
build-collection-server:
	go build -ldflags "$(LDFLAGS)" -o bin/collection-server ./cmd/collection-server

## build-all: Build for all target platforms (agent + collection-server)
build-all: build-linux build-linux-arm64 build-windows build-collection-server

## package: Build Linux amd64 agent and copy deploy files into dist/
package: build-linux
	@mkdir -p dist
	cp bin/$(APP_NAME)-linux-amd64 dist/$(APP_NAME)
	cp -r deploy/* dist/
	@echo "Package ready in dist/"

## package-deb: Build DEB package (requires nfpm)
package-deb: build-linux
	@mkdir -p dist
	cp bin/$(APP_NAME)-linux-amd64 dist/$(APP_NAME)
	VERSION=$(VERSION) nfpm package --config deploy/nfpm.yaml --target dist/ --packager deb
	@echo "DEB package built in dist/"

## package-rpm: Build RPM package (requires nfpm)
package-rpm: build-linux
	@mkdir -p dist
	cp bin/$(APP_NAME)-linux-amd64 dist/$(APP_NAME)
	VERSION=$(VERSION) nfpm package --config deploy/nfpm.yaml --target dist/ --packager rpm
	@echo "RPM package built in dist/"

## package-all: Build DEB + RPM packages
package-all: package-deb package-rpm
	@echo "All packages built in dist/"

## test: Run all tests
test:
	go test -v -race -count=1 ./...

## test-cover: Run tests with coverage
test-cover:
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

## lint: Run linter
lint:
	golangci-lint run ./...

## run: Build and run with default config
run: build
	./bin/$(APP_NAME) --config=configs/agent.yaml

## run-collect-only: Run in one-shot collect-only mode
run-collect-only: build
	./bin/$(APP_NAME) --config=configs/agent.yaml --mode=collect-only

## clean: Remove build artifacts
clean:
	rm -rf bin/ dist/ coverage.out coverage.html

## deps: Download and tidy dependencies
deps:
	go mod download
	go mod tidy

## version: Print version info
version:
	@echo "Version:    $(VERSION)"
	@echo "Git Commit: $(GIT_COMMIT)"
	@echo "Build Date: $(BUILD_DATE)"
	@echo "Go Version: $(GO_VERSION)"

## help: Show this help
help:
	@echo "Available targets:"
	@grep -E '^## ' Makefile | sed 's/## /  /'
