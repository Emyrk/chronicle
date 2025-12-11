.PHONY: install
install:
	go install ./cmd/chronicle

.PHONY: wasm
wasm:
	GOOS=js GOARCH=wasm go build -o ./site/parser.wasm ./cmd/wasm/

.PHONY: serve
serve: wasm
	@echo "Starting development server at http://localhost:8080"
	@cd site && python3 -m http.server 8080

.PHONY: gen
gen: database/dump.sql database/querier.go wasm
	go generate ./...

database/dump.sql: $(wildcard database/migrations/*.sql)
	go run ./database/gen/dump/main.go

database/querier.go: database/sqlc.yaml database/dump.sql $(wildcard database/queries/*.sql)
	./database/generate.sh
