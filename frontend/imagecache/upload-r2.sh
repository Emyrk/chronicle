#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICONS_DIR="${ICONS_DIR:-${SCRIPT_DIR}/${SERVER:-turtle}/icons}"

# Source .envrc for rclone credentials if direnv hasn't already
if [[ -f "${SCRIPT_DIR}/.envrc" ]]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.envrc"
fi

# R2 remote name (configure with: rclone config)
# Per-server upload: SERVER=turtle ./upload-r2.sh (or SERVER=epoch)
R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-icons}"
R2_PATH="${R2_PATH:-${SERVER:-turtle}}"

if [[ ! -d "$ICONS_DIR" ]]; then
  echo "Error: Icons directory not found: $ICONS_DIR"
  exit 1
fi

# Check rclone is available
if ! command -v rclone &> /dev/null; then
  echo "Error: rclone not found. Install it first."
  exit 1
fi

# Count files
total=$(find "$ICONS_DIR" -name "*.webp" | wc -l)
echo "Uploading $total WebP files to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/"

# Upload with:
# - Cache-Control: immutable, max-age=31536000 (1 year, effectively forever)
# - Content-Type: image/webp
# - Parallel transfers for speed
rclone copy "$ICONS_DIR" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --header-upload "Content-Type: image/webp" \
  --transfers 32 \
  --checkers 16 \
  --progress \
  --verbose

echo ""
echo "Done! Files uploaded to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/"
