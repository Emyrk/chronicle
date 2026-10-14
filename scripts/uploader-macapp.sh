#!/usr/bin/env bash
# Wrap the universal darwin binary in a Chronicle Uploader.app and zip it.
# Usage: uploader-macapp.sh <binary> <version> <out.zip>
set -euo pipefail
bin="$1" version="$2" out="$3"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
app="$work/Chronicle Uploader.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$(dirname "$0")/../cmd/uploader/packaging/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"
cp "$bin" "$app/Contents/MacOS/chronicle-uploader"
chmod +x "$app/Contents/MacOS/chronicle-uploader"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Chronicle Uploader</string>
  <key>CFBundleIdentifier</key><string>com.chronicleclassic.uploader</string>
  <key>CFBundleExecutable</key><string>chronicle-uploader</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
out_abs="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
(cd "$work" && ditto -c -k --keepParent "Chronicle Uploader.app" "$out_abs")
