#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAPS_DIR="${MAPS_DIR:-${SCRIPT_DIR}/forever/maps}"

# Source .envrc for rclone credentials if direnv has not already.
if [[ -f "${SCRIPT_DIR}/.envrc" ]]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.envrc"
fi

R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-icons}"
R2_PATH="${R2_PATH:-forever/maps}"

if [[ ! -f "${MAPS_DIR}/manifest.json" || ! -d "${MAPS_DIR}/tiles" ]]; then
  echo "Error: map export must contain manifest.json and tiles/: ${MAPS_DIR}" >&2
  exit 1
fi
if ! command -v rclone >/dev/null 2>&1; then
  echo "Error: rclone not found. Install it first." >&2
  exit 1
fi

total="$(find "${MAPS_DIR}/tiles" -type f -name '*.webp' | wc -l)"
echo "Uploading ${total} map tiles to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/tiles/"
rclone copy "${MAPS_DIR}/tiles" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/tiles/" \
  --include '*.webp' \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --header-upload "Content-Type: image/webp" \
  --transfers 32 \
  --checkers 16 \
  --progress \
  --verbose

if [[ -d "${MAPS_DIR}/renders" ]]; then
  rendered_total="$(find "${MAPS_DIR}/renders" -type f -name '*.png' | wc -l)"
  echo "Uploading ${rendered_total} rendered maps to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/renders/"
  rclone copy "${MAPS_DIR}/renders" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/renders/" \
    --include '*.png' \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/png" \
    --transfers 8 \
    --checkers 8 \
    --progress \
    --verbose
fi

echo "Uploading map manifest to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/manifest.json"
rclone copyto "${MAPS_DIR}/manifest.json" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/manifest.json" \
  --header-upload "Cache-Control: public, max-age=3600" \
  --header-upload "Content-Type: application/json" \
  --verbose

echo "Published maps under https://icons.chronicleclassic.com/${R2_PATH}/"
