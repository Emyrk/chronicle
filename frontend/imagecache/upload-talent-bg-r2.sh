#!/usr/bin/env bash
# Upload talent-background WebP files to R2.
# Reuses upload-r2.sh with overridden directories and R2 path.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export ICONS_DIR="${ICONS_DIR:-${SCRIPT_DIR}/${SERVER:-turtle}/talent-backgrounds}"
export R2_PATH="${R2_PATH:-${SERVER:-turtle}/talent-backgrounds}"

exec "${SCRIPT_DIR}/upload-r2.sh"
