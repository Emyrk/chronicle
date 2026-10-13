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
MAPS_UPLOAD_MODE="${MAPS_UPLOAD_MODE:-all}"

if [[ "${MAPS_UPLOAD_MODE}" != "styled" && ! -f "${MAPS_DIR}/manifest.json" ]]; then
  echo "Error: map export must contain manifest.json: ${MAPS_DIR}" >&2
  exit 1
fi
case "${MAPS_UPLOAD_MODE}" in
  all)
    if [[ ! -d "${MAPS_DIR}/original" ]]; then
      echo "Error: full map upload requires original/: ${MAPS_DIR}" >&2
      exit 1
    fi
    ;;
  legacy)
    if [[ ! -d "${MAPS_DIR}/tiles" ]]; then
      echo "Error: legacy map upload requires tiles/: ${MAPS_DIR}" >&2
      exit 1
    fi
    ;;
  rendered)
    if [[ ! -d "${MAPS_DIR}/render" ]]; then
      echo "Error: rendered map upload requires render/: ${MAPS_DIR}" >&2
      exit 1
    fi
    ;;
  styled)
    if [[ ! -s "${SCRIPT_DIR}/styled-maps/43-wailing-caverns-v2.jpeg" ]]; then
      echo "Error: styled Wailing Caverns map is missing" >&2
      exit 1
    fi
    ;;
  *)
    echo "Error: MAPS_UPLOAD_MODE must be 'all', 'legacy', 'rendered', or 'styled', got '${MAPS_UPLOAD_MODE}'" >&2
    exit 1
    ;;
esac
if ! command -v rclone >/dev/null 2>&1; then
  echo "Error: rclone not found. Install it first." >&2
  exit 1
fi

if [[ "${MAPS_UPLOAD_MODE}" == "all" && ! -d "${MAPS_DIR}/render" ]]; then
  echo "Error: full map upload requires render/: ${MAPS_DIR}" >&2
  exit 1
fi

if [[ "${MAPS_UPLOAD_MODE}" == "all" ]]; then
  total="$(find "${MAPS_DIR}/original" -type f -name '*.webp' | wc -l)"
  echo "Uploading ${total} map tiles to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/original/"
  rclone copy "${MAPS_DIR}/original" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/original/" \
    --include '*.webp' \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/webp" \
    --transfers 32 \
    --checkers 16 \
    --progress \
    --verbose
fi

if [[ "${MAPS_UPLOAD_MODE}" == "legacy" ]]; then
  total="$(find "${MAPS_DIR}/tiles" -type f -name '*.webp' | wc -l)"
  echo "Uploading ${total} legacy map tiles to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/tiles/"
  rclone copy "${MAPS_DIR}/tiles" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/tiles/" \
    --include '*.webp' \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/webp" \
    --transfers 32 \
    --checkers 16 \
    --progress \
    --verbose
fi

if [[ ( "${MAPS_UPLOAD_MODE}" == "all" || "${MAPS_UPLOAD_MODE}" == "rendered" ) && -d "${MAPS_DIR}/render" ]]; then
  rendered_total="$(find "${MAPS_DIR}/render" -type f -name '*.png' | wc -l)"
  if [[ "${MAPS_UPLOAD_MODE}" == "rendered" && "${rendered_total}" -eq 0 ]]; then
    echo "Error: rendered map upload found no PNG files in ${MAPS_DIR}/render" >&2
    exit 1
  fi
  echo "Uploading ${rendered_total} rendered maps to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/render/"
  rclone copy "${MAPS_DIR}/render" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/render/" \
    --include '*.png' \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/png" \
    --transfers 8 \
    --checkers 8 \
    --progress \
    --verbose
fi

if [[ "${MAPS_UPLOAD_MODE}" == "styled" ]]; then
  rclone copyto "${SCRIPT_DIR}/styled-maps/43-wailing-caverns-v2.jpeg" \
    "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/render-styled/43-wailing-caverns-v2.jpeg" \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/jpeg" \
    --verbose
  echo "Published styled map under https://icons.chronicleclassic.com/${R2_PATH}/render-styled/"
  exit 0
fi

echo "Uploading map manifest to ${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/manifest.json"
rclone copyto "${MAPS_DIR}/manifest.json" "${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}/manifest.json" \
  --header-upload "Cache-Control: public, max-age=3600" \
  --header-upload "Content-Type: application/json" \
  --verbose

echo "Published maps under https://icons.chronicleclassic.com/${R2_PATH}/"
