# WoW Combat Log Parser - WASM Web Interface

This document describes the WASM-based static web interface for parsing World of Warcraft combat logs.

## Overview

The parser has been compiled to WebAssembly and wrapped in a static HTML/JS interface that runs entirely in the browser. No backend server is required - all parsing happens client-side.

## Directory Structure

```
site/
├── index.html      # Main HTML page with UI
├── app.js          # JavaScript application logic
├── parser.wasm     # WASM binary (4.2MB)
├── wasm_exec.js    # Go WASM runtime
├── serve.sh        # Helper script to start local server
└── README.md       # Documentation
```

## WASM Implementation

### Go Source Code

The WASM wrapper is located at `golang/cmd/wasm/main.go`. It:

1. Exposes a `parseWoWLogs()` function to JavaScript
2. Accepts two `Uint8Array` parameters (the combat log files)
3. Uses the same parser logic as the CLI (`vanillaparser` package)
4. Returns the parsed state as JSON

Key code structure:
```go
func parseLogsFunc(this js.Value, args []js.Value) interface{} {
    // 1. Extract byte arrays from JS
    // 2. Create readers
    // 3. Initialize parser with merger
    // 4. Parse all lines
    // 5. Return state as JSON
}
```

### JavaScript Integration

The `app.js` file:

1. Loads the WASM module on page load
2. Handles file uploads via HTML5 File API
3. Reads files as ArrayBuffer
4. Passes data to WASM function
5. Displays JSON results

## Running the Interface

### Option 1: Using the Helper Script

```bash
cd site
./serve.sh 8000
```

Then open http://localhost:8000

### Option 2: Using Python Directly

```bash
cd site
python3 -m http.server 8000
```

## Usage

1. Open the web page in a modern browser
2. Select `WoWCombatLog.txt` (first file input)
3. Select `WoWRawCombatLog.txt` (second file input)
4. Click "Parse Logs"
5. View the parsed state as JSON

All processing happens locally in the browser - no data is uploaded to any server.

## Rebuilding WASM

To rebuild the WASM binary after code changes:

```bash
make wasm
```