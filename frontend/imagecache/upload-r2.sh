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

# Count files
total=$(find "$ICONS_DIR" -name "*.webp" | wc -l)
echo "Uploading $total WebP files to ${R2_BUCKET}/${R2_PATH}/ with $UPLOAD_TOOL"

# Upload with immutable one-year caching and the WebP content type.
if [[ "$UPLOAD_TOOL" == "rclone" ]]; then
  rclone copy "$ICONS_DIR" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/" \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/webp" \
    --transfers 32 \
    --checkers 16 \
    --progress \
    --verbose
else
  while IFS= read -r icon; do
    pnpm -C "$WRANGLER_DIR" exec wrangler r2 object put \
      "${R2_BUCKET%/}/${R2_PATH#/}/$(basename "$icon")" --file "$icon" \
      --content-type image/webp --cache-control "public, max-age=31536000, immutable" --remote
  done < <(find "$ICONS_DIR" -name "*.webp" -type f | sort)
fi

echo ""
echo "Done! Files uploaded to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/"
