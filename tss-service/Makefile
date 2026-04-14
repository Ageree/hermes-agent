.PHONY: all proto build test clean run docker

# Default parameters
THRESHOLD ?= 3
TOTAL ?= 5
PORT ?= 50051

all: proto build

# Generate protobuf code
proto:
	@echo "Generating protobuf code..."
	@which protoc > /dev/null || (echo "protoc not found. Install with: brew install protobuf" && exit 1)
	@which protoc-gen-go > /dev/null || go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	@which protoc-gen-go-grpc > /dev/null || go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
	
	protoc --go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		proto/tss.proto

# Build the TSS server
build:
	@echo "Building TSS server..."
	go build -o bin/tss-server ./cmd/tss-server

# Build for multiple platforms
build-all:
	@echo "Building for all platforms..."
	GOOS=darwin GOARCH=amd64 go build -o bin/tss-server-darwin-amd64 ./cmd/tss-server
	GOOS=darwin GOARCH=arm64 go build -o bin/tss-server-darwin-arm64 ./cmd/tss-server
	GOOS=linux GOARCH=amd64 go build -o bin/tss-server-linux-amd64 ./cmd/tss-server
	GOOS=linux GOARCH=arm64 go build -o bin/tss-server-linux-arm64 ./cmd/tss-server

# Run tests
test:
	@echo "Running tests..."
	go test -v ./...

# Run the server
run:
	@echo "Starting TSS server on port $(PORT)..."
	go run ./cmd/tss-server --port=$(PORT)

# Run 5-node test cluster
run-cluster:
	@echo "Starting 5-node TSS cluster..."
	./scripts/run-cluster.sh

# Docker build
docker:
	@echo "Building Docker image..."
	docker build -t stealthpay/tss-server:latest .

# Run in Docker
docker-run:
	@echo "Running TSS server in Docker..."
	docker run -p $(PORT):$(PORT) stealthpay/tss-server:latest

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf bin/
	rm -f proto/*.pb.go

# Install dependencies
deps:
	@echo "Installing dependencies..."
	go mod download
	go mod tidy

# Development setup
dev-setup:
	@echo "Setting up development environment..."
	go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Lint
lint:
	@echo "Running linter..."
	golangci-lint run ./...

# Security scan
security:
	@echo "Running security scan..."
	gosec ./...

# Format code
fmt:
	@echo "Formatting code..."
	go fmt ./...

# Full CI pipeline
ci: fmt lint test security build
	@echo "✅ All CI checks passed"
