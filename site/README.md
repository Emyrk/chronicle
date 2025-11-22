# WoW Combat Log Parser - Static Site

[![Deploy to GitHub Pages](https://github.com/Emyrk/chronicle/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Emyrk/chronicle/actions/workflows/deploy-pages.yml)
[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://emyrk.github.io/chronicle/)


This directory contains a static HTML page that uses WebAssembly to parse World of Warcraft combat logs entirely in the browser.

## Files

- `index.html` - Main HTML page with UI
- `app.js` - JavaScript application that handles file uploads and WASM interaction
- `parser.wasm` - WebAssembly binary compiled from Go code
- `wasm_exec.js` - Go's WASM runtime support (from Go SDK)

## Usage

### Running Locally

You can serve this directory with any static file server. For example:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Python 2
python -m SimpleHTTPServer 8000

# Using Node.js (npx http-server)
npx http-server -p 8000

# Using Go
go run -mod=mod github.com/coder/serve@latest -p 8000
```

Then open http://localhost:8000 in your browser.

### Using the Parser

1. Open the page in a modern browser (Chrome, Firefox, Safari, Edge)
2. Select your `WoWCombatLog.txt` file (first input)
3. Select your `WoWRawCombatLog.txt` file (second input)
4. Click "Parse Logs"
5. View the parsed state as JSON

## Building the WASM Binary

To rebuild the WASM binary from the Go source:

```bash
cd ../golang
GOOS=js GOARCH=wasm go build -o ../site/parser.wasm ./cmd/wasm/
```

## Technical Details

The parser is compiled to WebAssembly from Go code and runs entirely in the browser. No data is sent to any server - everything is processed locally.

The WASM module exposes a `parseWoWLogs()` function that accepts two `Uint8Array` parameters (the two log files) and returns the parsed state as JSON.
