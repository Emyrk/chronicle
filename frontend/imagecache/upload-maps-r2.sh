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

# Each job owns only its assets and one root-level source manifest. The published
# manifest.json is rebuilt from all available source manifests after every job.
remote="${R2_REMOTE}:${R2_BUCKET}/${R2_PATH}"
styled_dir="${SCRIPT_DIR}/styled-maps/${SERVER:-forever}"
styled_source="${styled_dir}/manifest.styled.json"
manual_dir="${SCRIPT_DIR}/map-layers/${SERVER:-forever}"
case "${MAPS_UPLOAD_MODE}" in
  all|original)
    [[ -s "${MAPS_DIR}/manifest.original.json" && -d "${MAPS_DIR}/original" ]] || {
      echo "Error: original map manifest or assets are missing from ${MAPS_DIR}" >&2; exit 1;
    }
    ;;
  rendered)
    [[ -s "${MAPS_DIR}/manifest.rendered.json" && -d "${MAPS_DIR}/render" ]] || {
      echo "Error: render manifest or assets are missing from ${MAPS_DIR}" >&2; exit 1;
    }
    ;;
  styled)
    [[ -s "${styled_source}" ]] || { echo "Error: styled manifest is missing: ${styled_source}" >&2; exit 1; }
    ;;
  renders|3d)
    [[ -s "${manual_dir}/manifest.${MAPS_UPLOAD_MODE}.json" ]] || {
      echo "Error: manual map manifest is missing: ${manual_dir}/manifest.${MAPS_UPLOAD_MODE}.json" >&2; exit 1;
    }
    ;;
  *) echo "Error: MAPS_UPLOAD_MODE must be all, original, rendered, styled, renders or 3d" >&2; exit 1 ;;
esac
if ! command -v rclone >/dev/null 2>&1; then
  echo "Error: rclone not found. Install it first." >&2
  exit 1
fi
if [[ "${MAPS_UPLOAD_MODE}" == "all" ]]; then
  [[ -s "${MAPS_DIR}/manifest.rendered.json" && -d "${MAPS_DIR}/render" ]] || {
    echo "Error: full map upload requires a render manifest and assets" >&2; exit 1;
  }
fi

# Validate and merge all source manifests before modifying remote objects.
# A transport/auth failure cannot masquerade as an absent optional layer.
listing="$(rclone lsf "${remote}/" --files-only)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
for layer in original rendered styled renders 3d; do
  local_source="${MAPS_DIR}/manifest.${layer}.json"
  if [[ "${MAPS_UPLOAD_MODE}" == "styled" && "${layer}" == "styled" ]]; then
    cp "${styled_source}" "${tmp}/manifest.${layer}.json"
  elif [[ "${MAPS_UPLOAD_MODE}" == "${layer}" && ( "${layer}" == "renders" || "${layer}" == "3d" ) ]]; then
    cp "${manual_dir}/manifest.${layer}.json" "${tmp}/manifest.${layer}.json"
  elif [[ ( "${MAPS_UPLOAD_MODE}" == "all" || "${MAPS_UPLOAD_MODE}" == "original" ) && "${layer}" == "original" ]] ||
       [[ ( "${MAPS_UPLOAD_MODE}" == "all" || "${MAPS_UPLOAD_MODE}" == "rendered" ) && "${layer}" == "rendered" ]]; then
    cp "${local_source}" "${tmp}/manifest.${layer}.json"
  elif printf '%s\n' "${listing}" | grep -Fxq "manifest.${layer}.json"; then
    rclone copyto "${remote}/manifest.${layer}.json" "${tmp}/manifest.${layer}.json"
  fi
done

# Manual registrations must work even after make clean-maps removed generated files.
if [[ "${MAPS_UPLOAD_MODE}" == "renders" || "${MAPS_UPLOAD_MODE}" == "3d" ]]; then
  mkdir -p "${MAPS_DIR}"
fi

# Validate original metadata, optional layers and target compatibility before upload.
go run ../../scripts/dbcdata merge-wowdata-maps \
  --original="${tmp}/manifest.original.json" \
  --render="${tmp}/manifest.rendered.json" \
  --styled="${tmp}/manifest.styled.json" \
  --renders="${tmp}/manifest.renders.json" \
  --3d="${tmp}/manifest.3d.json" \
  --out="${MAPS_DIR}/manifest.json"

if [[ "${MAPS_UPLOAD_MODE}" == "all" || "${MAPS_UPLOAD_MODE}" == "original" ]]; then
  rclone copy "${MAPS_DIR}/original" "${remote}/original/" \
    --include '*.webp' \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/webp" --transfers 32 --checkers 16 --progress --verbose
  rclone copyto "${MAPS_DIR}/manifest.original.json" "${remote}/manifest.original.json" \
    --header-upload "Cache-Control: public, max-age=3600" \
    --header-upload "Content-Type: application/json" --verbose
fi

if [[ "${MAPS_UPLOAD_MODE}" == "all" || "${MAPS_UPLOAD_MODE}" == "rendered" ]]; then
  rclone copy "${MAPS_DIR}/render" "${remote}/render/" \
    --include '*.png' \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: image/png" --transfers 8 --checkers 8 --progress --verbose
  rclone copyto "${MAPS_DIR}/manifest.rendered.json" "${remote}/manifest.rendered.json" \
    --header-upload "Cache-Control: public, max-age=3600" \
    --header-upload "Content-Type: application/json" --verbose
fi

if [[ "${MAPS_UPLOAD_MODE}" == "styled" ]]; then
  # Assets live in Git rather than the generated map directory.
  rclone copy "${styled_dir}" "${remote}/render-styled/" \
    --include '*.jpeg' --include '*.png' --include '*.webp' \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" --verbose
  rclone copyto "${styled_source}" "${remote}/manifest.styled.json" \
    --header-upload "Cache-Control: public, max-age=3600" \
    --header-upload "Content-Type: application/json" --verbose
fi

if [[ "${MAPS_UPLOAD_MODE}" == "renders" || "${MAPS_UPLOAD_MODE}" == "3d" ]]; then
  # These assets were uploaded by hand; publish only their source manifest.
  rclone copyto "${manual_dir}/manifest.${MAPS_UPLOAD_MODE}.json" "${remote}/manifest.${MAPS_UPLOAD_MODE}.json" \
    --header-upload "Cache-Control: public, max-age=3600" \
    --header-upload "Content-Type: application/json" --verbose
fi

rclone copyto "${MAPS_DIR}/manifest.json" "${remote}/manifest.json" \
  --header-upload "Cache-Control: public, max-age=3600" \
  --header-upload "Content-Type: application/json" --verbose

echo "Published merged maps under https://icons.chronicleclassic.com/${R2_PATH}/"
