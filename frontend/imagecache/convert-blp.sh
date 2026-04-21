#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLP_DIR="${BLP_DIR:-${SCRIPT_DIR}/${SERVER:-turtle}/blp}"
ICONS_DIR="${ICONS_DIR:-${SCRIPT_DIR}/${SERVER:-turtle}/icons}"
FAILED_LOG="${FAILED_LOG:-${SCRIPT_DIR}/${SERVER:-turtle}/failed_conversions.log}"

if [[ ! -d "$BLP_DIR" ]]; then
  echo "Error: BLP directory not found: $BLP_DIR"
  exit 1
fi

mkdir -p "$ICONS_DIR"
: > "$FAILED_LOG"  # Clear/create failed log

# Count files for progress
total=$(find "$BLP_DIR" -iname "*.blp" | wc -l)
current=0
failed=0

echo "Converting $total BLP files to WebP..."

find "$BLP_DIR" -iname "*.blp" | while read -r blp_file; do
  current=$((current + 1))
  
  # Get base name without extension, lowercase
  base_name=$(basename "$blp_file" | sed 's/\.[bB][lL][pP]$//' | tr '[:upper:]' '[:lower:]')
  webp_file="${ICONS_DIR}/${base_name}.webp"
  
  # Temp PNG file
  tmp_png=$(mktemp --suffix=.png)
  trap "rm -f '$tmp_png'" EXIT
  
  echo "[$current/$total] $base_name"
  
  # BLP → PNG using Python + Pillow (has native BLP support)
  if ! python3 -c "
import sys
from PIL import Image
img = Image.open(sys.argv[1])
img.save(sys.argv[2], 'PNG')
" "$blp_file" "$tmp_png" 2>&1; then
    echo "  Warning: Failed to convert $blp_file (skipping)"
    echo "$blp_file" >> "$FAILED_LOG"
    rm -f "$tmp_png"
    continue
  fi
  
  # PNG → WebP (quality 80, good balance for icons)
  if ! cwebp -q 80 "$tmp_png" -o "$webp_file"; then
    echo "  Warning: Failed to encode WebP for $base_name (skipping)"
    echo "$blp_file" >> "$FAILED_LOG"
    rm -f "$tmp_png"
    continue
  fi
  
  rm -f "$tmp_png"
done

echo ""
echo "Done! Converted files are in: $ICONS_DIR"
echo "Total WebP files: $(find "$ICONS_DIR" -name "*.webp" | wc -l)"

failed_count=$(wc -l < "$FAILED_LOG")
if [[ "$failed_count" -gt 0 ]]; then
  echo ""
  echo "Warning: $failed_count files failed to convert (see $FAILED_LOG)"
fi
