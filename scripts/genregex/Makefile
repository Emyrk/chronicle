.PHONY: generate build clean help

# Generate source.go from templates
generate:
	@go run main.go

# Build the generator executable
build:
	@go build -o genregex main.go
	@echo "✓ Built genregex executable"

# Clean build artifacts
clean:
	@rm -f genregex
	@echo "✓ Cleaned build artifacts"

# Show help
help:
	@echo "Regex Pattern Generator"
	@echo ""
	@echo "Targets:"
	@echo "  generate  - Generate source.go from templates (default)"
	@echo "  build     - Build the genregex executable"
	@echo "  clean     - Remove build artifacts"
	@echo "  help      - Show this help message"

# Default target
.DEFAULT_GOAL := generate
