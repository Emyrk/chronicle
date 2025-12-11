#!/bin/bash
# Test script to verify Makefile targets work

set -e  # Exit on any error

echo "🧪 Testing Makefile targets..."
echo ""

# Test wasm target
echo "1️⃣  Testing 'make wasm'..."
make wasm > /dev/null 2>&1
if [ -f "site/parser.wasm" ]; then
    SIZE=$(ls -lh site/parser.wasm | awk '{print $5}')
    echo "   ✅ WASM built successfully ($SIZE)"
else
    echo "   ❌ WASM file not found!"
    exit 1
fi
echo ""

# Verify WASM file is valid (has WASM header)
echo "2️⃣  Verifying WASM file format..."
if head -c 4 site/parser.wasm | od -An -t x1 | grep -q "00 61 73 6d"; then
    echo "   ✅ Valid WASM file format"
else
    echo "   ❌ Invalid WASM file format!"
    exit 1
fi
echo ""

# Check that serve script exists
echo "3️⃣  Checking serve script..."
if [ -f "site/serve.sh" ] && [ -x "site/serve.sh" ]; then
    echo "   ✅ Serve script exists and is executable"
else
    echo "   ❌ Serve script missing or not executable!"
    exit 1
fi
echo ""

# Verify HTML/JS files exist
echo "4️⃣  Checking frontend files..."
if [ -f "site/index.html" ] && [ -f "site/app.js" ]; then
    echo "   ✅ Frontend files exist"
else
    echo "   ❌ Frontend files missing!"
    exit 1
fi
echo ""

echo "🎉 All tests passed!"
echo ""
echo "To start the server, run:"
echo "  make serve"
