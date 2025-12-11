#!/usr/bin/env bash
# Simple HTTP server for testing the WASM application
# Usage: ./serve.sh [port]

PORT=${1:-8080}

echo "Starting HTTP server on http://localhost:$PORT"
echo "Press Ctrl+C to stop"

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
# Check if Python 2 is available
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer $PORT
else
    echo "Error: Python not found. Please install Python to run the server."
    exit 1
fi
