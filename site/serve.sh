#!/usr/bin/env bash
# Simple script to serve the static site

PORT=${1:-8000}

echo "Starting static server on http://localhost:$PORT"
echo "Press Ctrl+C to stop"
echo ""

if command -v python3 &> /dev/null; then
    cd "$(dirname "$0")"
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    cd "$(dirname "$0")"
    python -m SimpleHTTPServer $PORT
else
    echo "Error: Python not found. Please install Python or use another web server."
    exit 1
fi
