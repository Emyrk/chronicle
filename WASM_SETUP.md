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

### Option 3: Using Other Servers

Any static file server will work:
- `npx http-server`
- `php -S localhost:8000`
- nginx, caddy, etc.

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
cd golang
GOOS=js GOARCH=wasm go build -o ../site/parser.wasm ./cmd/wasm/
```

## Testing with Sample Data

If you have sample log files at the path mentioned in your example:

```bash
# The parser expects these two files to be uploaded via the web UI:
# - ignoredlogs/hateforge_av/WoWCombatLog.txt
# - ignoredlogs/hateforge_av/WoWRawCombatLog.txt
```

## Features

- ✅ Client-side parsing (no server required)
- ✅ Drag & drop file upload
- ✅ Real-time status updates
- ✅ JSON output display
- ✅ File size display
- ✅ Error handling
- ✅ Responsive design

## Browser Compatibility

The page requires:
- WebAssembly support (all modern browsers)
- File API support
- ES6+ JavaScript

Tested in:
- Chrome/Edge (Chromium)
- Firefox
- Safari

## Performance

- WASM binary size: ~4.2MB (uncompressed)
- Parse time: Depends on log file size
- Memory usage: Depends on log file size
- All processing is synchronous (may block UI for large files)

## Future Improvements

Potential enhancements:
- [ ] Compress WASM binary with gzip/brotli
- [ ] Add Web Worker support for async parsing
- [ ] Add progress indicators for large files
- [ ] Add more detailed statistics visualization
- [ ] Export parsed data in different formats
- [ ] Add syntax highlighting for JSON output
