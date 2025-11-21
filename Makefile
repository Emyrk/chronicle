.PHONY: help test lint fmt install-tools clean

# Default target
help:
	@echo "Available targets:"
	@echo "  make test         - Run tests with gotestsum"
	@echo "  make test-race    - Run tests with race detector"
	@echo "  make lint         - Run golangci-lint"
	@echo "  make fmt          - Format code with gofmt and goimports"
	@echo "  make install-tools - Install required Go tools"
	@echo "  make clean        - Clean test cache and artifacts"

# Install required tools
install-tools:
	@echo "Installing gotestsum..."
	@go install gotest.tools/gotestsum@latest
	@echo "Installing golangci-lint..."
	@go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@echo "Installing goimports..."
	@go install golang.org/x/tools/cmd/goimports@latest
	@echo "Tools installed successfully!"

# Run tests with gotestsum
test:
	@echo "Running tests..."
	@gotestsum --format testname -- -coverprofile=coverage.out ./...

# Run tests with race detector
test-race:
	@echo "Running tests with race detector..."
	@gotestsum --format testname -- -race -coverprofile=coverage.out ./...

# Run tests with verbose output
test-verbose:
	@echo "Running tests (verbose)..."
	@gotestsum --format standard-verbose -- -coverprofile=coverage.out ./...

# Run golangci-lint
lint:
	@echo "Running golangci-lint..."
	@golangci-lint run --verbose

# Fix linting issues where possible
lint-fix:
	@echo "Running golangci-lint with --fix..."
	@golangci-lint run --fix --verbose

# Format code
fmt:
	@echo "Formatting code..."
	@gofmt -s -w .
	@goimports -w .

# Show test coverage
coverage:
	@if [ -f coverage.out ]; then \
		go tool cover -func=coverage.out; \
	else \
		echo "No coverage.out file found. Run 'make test' first."; \
	fi

# Show test coverage in browser
coverage-html:
	@if [ -f coverage.out ]; then \
		go tool cover -html=coverage.out; \
	else \
		echo "No coverage.out file found. Run 'make test' first."; \
	fi

# Clean test cache and artifacts
clean:
	@echo "Cleaning test cache and artifacts..."
	@go clean -testcache
	@rm -f coverage.out junit.xml
	@echo "Clean complete!"

# Run CI checks locally (same as GitHub Actions)
ci: lint test-race
	@echo "CI checks passed!"
