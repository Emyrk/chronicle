#!/usr/bin/env bash
# Shared runner — sourced by per-site scripts.
# Expects TARGETS and/or WOWDATA_TARGETS arrays to be set by the caller.
# Extra CLI flags ($@) are forwarded to each import run.
#
# TARGETS format: server|api-url|dataset-id
# WOWDATA_TARGETS format: label|client-path|api-url|dataset-id|product|build
#
# Shows all targets upfront, asks once, then runs them all.

set -euo pipefail

legacy_count=0
wowdata_count=0
if declare -p TARGETS >/dev/null 2>&1; then
  legacy_count=${#TARGETS[@]}
fi
if declare -p WOWDATA_TARGETS >/dev/null 2>&1; then
  wowdata_count=${#WOWDATA_TARGETS[@]}
fi
if ((legacy_count == 0 && wowdata_count == 0)); then
  echo "No TARGETS or WOWDATA_TARGETS defined." >&2
  exit 1
fi

echo "The following imports will run:"
echo
if ((legacy_count > 0)); then
  for entry in "${TARGETS[@]}"; do
    IFS='|' read -r server api_url dataset_id <<< "$entry"
    echo "  • legacy server=${server}  url=${api_url}  dataset=${dataset_id}"
  done
fi
if ((wowdata_count > 0)); then
  for entry in "${WOWDATA_TARGETS[@]}"; do
    IFS='|' read -r label client api_url dataset_id product build <<< "$entry"
    echo "  • wowdata target=${label}  url=${api_url}  dataset=${dataset_id}"
    echo "      client=${client}  product=${product}  build=${build}"
  done
fi
echo

total_count=$((legacy_count + wowdata_count))
read -rp "Proceed with all ${total_count} import(s)? [y/N] " answer
if [[ ! "$answer" =~ ^[Yy]$ ]]; then
  echo "Canceled."
  exit 0
fi
echo

failed=0
if ((legacy_count > 0)); then
  for entry in "${TARGETS[@]}"; do
    IFS='|' read -r server api_url dataset_id <<< "$entry"
    echo "==> Uploading legacy DBCs to ${api_url} (server=${server}, dataset=${dataset_id})"
    if go run ./scripts/dbcdata import \
      --server "$server" \
      --api-url "$api_url" \
      --dataset-id "$dataset_id" \
      --yes \
      "$@"; then
      echo "    ✓ Success"
    else
      echo "    ✗ FAILED (exit $?)"
      failed=1
    fi
    echo
  done
fi

if ((wowdata_count > 0)); then
  for entry in "${WOWDATA_TARGETS[@]}"; do
    IFS='|' read -r label client api_url dataset_id product build <<< "$entry"
    echo "==> Extracting and uploading wowdata to ${api_url} (target=${label}, dataset=${dataset_id})"
    if go run ./scripts/dbcdata import-wowdata \
      --client "$client" \
      --product "$product" \
      --build "$build" \
      --api-url "$api_url" \
      --dataset-id "$dataset_id" \
      "$@"; then
      echo "    ✓ Success"
    else
      echo "    ✗ FAILED (exit $?)"
      failed=1
    fi
    echo
  done
fi

if [ "$failed" -ne 0 ]; then
  echo "Some uploads failed."
  exit 1
fi
echo "All uploads complete."
