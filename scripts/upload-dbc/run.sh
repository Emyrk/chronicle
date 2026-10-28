#!/usr/bin/env bash
# Shared runner — sourced by per-site scripts.
# Expects TARGETS and/or WOWDATA_TARGETS arrays to be set by the caller.
# Extra CLI flags ($@) are forwarded to each import run. Use --select=<name>
# to run only entries whose first field exactly matches that target name.
#
# TARGETS format: server|api-url|dataset-id
# WOWDATA_TARGETS format: label|client-path|api-url|dataset-id|product|build|source
#
# Shows the selected targets upfront, asks once, then runs them all.

set -euo pipefail

selected_target=""
show_help=0
forward_args=()
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      show_help=1
      ;;
    --select=*)
      selected_target="${arg#--select=}"
      if [[ -z "$selected_target" ]]; then
        echo "--select requires a target name." >&2
        exit 1
      fi
      ;;
    *)
      forward_args+=("$arg")
      ;;
  esac
done
set -- "${forward_args[@]}"

if ((show_help)); then
  echo "Usage: $0 [--select=<target>] [import flags...]"
  echo
  echo "Options:"
  echo "  --select=<target>  Run only the target with this exact name."
  echo "  --help, -h         Show this help."
  echo
  echo "Available targets:"
  if declare -p TARGETS >/dev/null 2>&1; then
    for entry in "${TARGETS[@]}"; do
      echo "  ${entry%%|*} (legacy)"
    done
  fi
  if declare -p WOWDATA_TARGETS >/dev/null 2>&1; then
    for entry in "${WOWDATA_TARGETS[@]}"; do
      echo "  ${entry%%|*} (wowdata)"
    done
  fi
  echo
  echo "All other arguments are forwarded to the selected import command(s)."
  exit 0
fi

if [[ -n "$selected_target" ]]; then
  matched=0

  if declare -p TARGETS >/dev/null 2>&1; then
    selected_targets=()
    for entry in "${TARGETS[@]}"; do
      target_name="${entry%%|*}"
      if [[ "$target_name" == "$selected_target" ]]; then
        selected_targets+=("$entry")
        matched=1
      fi
    done
    TARGETS=("${selected_targets[@]}")
  fi

  if declare -p WOWDATA_TARGETS >/dev/null 2>&1; then
    selected_wowdata_targets=()
    for entry in "${WOWDATA_TARGETS[@]}"; do
      target_name="${entry%%|*}"
      if [[ "$target_name" == "$selected_target" ]]; then
        selected_wowdata_targets+=("$entry")
        matched=1
      fi
    done
    WOWDATA_TARGETS=("${selected_wowdata_targets[@]}")
  fi

  if ((matched == 0)); then
    echo "No target named '${selected_target}'." >&2
    exit 1
  fi
fi

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
    IFS='|' read -r label client api_url dataset_id product build source <<< "$entry"
    source="${source:-local}"
    echo "  • wowdata target=${label}  url=${api_url}  dataset=${dataset_id}"
    echo "      client=${client}  product=${product}  build=${build}  source=${source}"
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
    IFS='|' read -r label client api_url dataset_id product build source <<< "$entry"
    source="${source:-local}"
    echo "==> Extracting and uploading wowdata to ${api_url} (target=${label}, dataset=${dataset_id})"
    if go run ./scripts/dbcdata import-wowdata \
      --client "$client" \
      --product "$product" \
      --build "$build" \
      --source "$source" \
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
