#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICON_LIST_FILE="${ICON_LIST_FILE:-${SCRIPT_DIR}/${SERVER:-turtle}/icon-list.json}"

# Source .envrc for rclone credentials if direnv hasn't already
if [[ -f "${SCRIPT_DIR}/.envrc" ]]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.envrc"
fi

# R2 remote name (configure with: rclone config)
# Per-server upload: SERVER=turtle ./upload-icon-list-r2.sh (or SERVER=epoch)
R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET-icons}"
R2_PATH="${R2_PATH-${SERVER:-turtle}}"
R2_FILENAME="${R2_FILENAME-icon-list.json}"
R2_PUBLIC_BASE_URL="${R2_PUBLIC_BASE_URL-https://70f93c8cfa460e9932953b7fa0c9ec04.r2.cloudflarestorage.com/icons}"

if [[ ! -f "$ICON_LIST_FILE" ]]; then
  echo "Error: icon list file not found: $ICON_LIST_FILE"
  echo "Run: go run ./scripts/dbstaticgen/main.go"
  exit 1
fi

if [[ -z "$R2_BUCKET" ]]; then
  echo "Error: R2_BUCKET is empty."
  echo "For S3/R2 remotes, destination must include a bucket (e.g. 'icons')."
  echo "Try: R2_BUCKET=icons ./upload-icon-list-r2.sh"
  exit 1
fi

WRANGLER_DIR="${SCRIPT_DIR}/../telemetry"
UPLOAD_TOOL="${UPLOAD_TOOL:-}"
if [[ -z "$UPLOAD_TOOL" ]] && command -v rclone >/dev/null 2>&1 \
    && rclone listremotes | grep -qx "${R2_REMOTE}:" \
    && [[ "$(rclone config show "$R2_REMOTE" | awk -F' = ' '$1 == "type" {print $2; exit}')" == "s3" ]]; then
  UPLOAD_TOOL="rclone"
elif [[ -z "$UPLOAD_TOOL" ]] && command -v pnpm >/dev/null 2>&1 \
    && [[ -x "$WRANGLER_DIR/node_modules/.bin/wrangler" ]]; then
  UPLOAD_TOOL="wrangler"
fi
if [[ "$UPLOAD_TOOL" != "rclone" && "$UPLOAD_TOOL" != "wrangler" ]]; then
  echo "Error: publishing requires an S3-backed rclone remote '${R2_REMOTE}:' or frontend/telemetry's Wrangler install." >&2
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

echo "Uploading ${ICON_LIST_FILE} to ${R2_BUCKET}/${R2_PATH}/${R2_FILENAME} with $UPLOAD_TOOL"

# Upload with one-week caching and the JSON content type.
if [[ "$UPLOAD_TOOL" == "rclone" ]]; then
  rclone copyto "$ICON_LIST_FILE" "$DEST" \
    --header-upload "Cache-Control: public, max-age=604800" \
    --header-upload "Content-Type: application/json" \
    --progress \
    --verbose
else
  pnpm -C "$WRANGLER_DIR" exec wrangler r2 object put \
    "${R2_BUCKET%/}/${R2_PATH#/}/${R2_FILENAME}" --file "$ICON_LIST_FILE" \
    --content-type application/json --cache-control "public, max-age=604800" --remote
fi

PUBLIC_BASE="${R2_PUBLIC_BASE_URL%/}"
if [[ -n "$R2_PATH" ]]; then
  PUBLIC_BASE="${PUBLIC_BASE}/${R2_PATH#/}"
fi
PUBLIC_URL="${PUBLIC_BASE}/${R2_FILENAME}"

echo ""
echo "Done! Uploaded to ${R2_BUCKET}/${R2_PATH}/${R2_FILENAME} with $UPLOAD_TOOL"
echo "Public URL: ${PUBLIC_URL}"
