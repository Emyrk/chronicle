PHONY: install
install:
	(cd ./golang && go install ./cmd/chronicle)

wasm:
	(cd ./golang && GOOS=js GOARCH=wasm go build -o ../site/parser.wasm ./cmd/wasm/)