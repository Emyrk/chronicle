#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICON_LIST_FILE="${SCRIPT_DIR}/icon-list.json"

# R2 remote name (configure with: rclone config)
R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET-icons}"
R2_PATH="${R2_PATH-}"
R2_FILENAME="${R2_FILENAME-icon-list.json}"
R2_PUBLIC_BASE_URL="${R2_PUBLIC_BASE_URL-https://70f93c8cfa460e9932953b7fa0c9ec04.r2.cloudflarestorage.com/icons}"

if [[ ! -f "$ICON_LIST_FILE" ]]; then
  echo "Error: icon list file not found: $ICON_LIST_FILE"
  echo "Run: go run ./scripts/dbstaticgen/main.go"
  exit 1
fi

# Check rclone is available
if ! command -v rclone &> /dev/null; then
  echo "Error: rclone not found. Install it first."
  exit 1
fi

if ! rclone listremotes | grep -qx "${R2_REMOTE}:"; then
  echo "Error: rclone remote '${R2_REMOTE}' not found."
  echo "Available remotes:"
  rclone listremotes || true
  exit 1
fi

if [[ -z "$R2_BUCKET" ]]; then
  echo "Error: R2_BUCKET is empty."
  echo "For S3/R2 remotes, destination must include a bucket (e.g. 'icons')."
  echo "Try: R2_BUCKET=icons ./upload-icon-list-r2.sh"
  exit 1
fi

DEST="${R2_REMOTE}:"
if [[ -n "$R2_BUCKET" ]]; then
  DEST="${DEST}${R2_BUCKET%/}"
fi
if [[ -n "$R2_PATH" ]]; then
  if [[ "$DEST" == *: ]]; then
    DEST="${DEST}${R2_PATH#/}"
  else
    DEST="${DEST}/${R2_PATH#/}"
  fi
fi
if [[ "$DEST" == *: ]]; then
  DEST="${DEST}${R2_FILENAME}"
else
  DEST="${DEST}/${R2_FILENAME}"
fi

echo "Uploading ${ICON_LIST_FILE} to ${DEST}"

# Upload with:
# - Cache-Control: public, max-age=604800 (1 week)
# - Content-Type: application/json
rclone copyto "$ICON_LIST_FILE" "$DEST" \
  --header-upload "Cache-Control: public, max-age=604800" \
  --header-upload "Content-Type: application/json" \
  --progress \
  --verbose

PUBLIC_BASE="${R2_PUBLIC_BASE_URL%/}"
if [[ -n "$R2_PATH" ]]; then
  PUBLIC_BASE="${PUBLIC_BASE}/${R2_PATH#/}"
fi
PUBLIC_URL="${PUBLIC_BASE}/${R2_FILENAME}"

echo ""
echo "Done! Uploaded to ${DEST}"
echo "Public URL: ${PUBLIC_URL}"
