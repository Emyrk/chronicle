#!/usr/bin/env bash
# Backfill `Cache-Control: public, max-age=31536000, immutable` on content-addressed
# map assets (`<ns>/maps/3d/*`, `<ns>/maps/renders/*`) uploaded before the header
# was set. Manifests are never touched: they stay short-lived.
#
# Dry run (default) lists every affected object and changes nothing:
#   ./backfill-maps-cache-control.sh
# Apply rewrites each affected object's metadata in place (S3 CopyObject onto
# itself, MetadataDirective=REPLACE, keeping its Content-Type):
#   R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com AWS_PROFILE=<r2 profile> \
#     ./backfill-maps-cache-control.sh --apply
#
# With R2_ENDPOINT set, objects are listed from the bucket and checked at origin
# (this includes assets no manifest references any more, such as rollback copies).
# Without it, objects are discovered from the published manifests and checked
# through the CDN, which needs no credentials.
set -euo pipefail

IMMUTABLE="public, max-age=31536000, immutable"
R2_BUCKET="${R2_BUCKET:-icons}"
CDN_BASE="${CDN_BASE:-https://icons.chronicleclassic.com}"
NAMESPACES="${NAMESPACES:-turtle forever azerothcore octowow epoch}"
apply=false
[[ "${1:-}" == "--apply" ]] && apply=true
if [[ "${apply}" == true && -z "${R2_ENDPOINT:-}" ]]; then
  echo "Error: --apply needs R2_ENDPOINT and R2 credentials (AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)" >&2
  exit 1
fi
for tool in curl jq; do
  command -v "${tool}" >/dev/null 2>&1 || { echo "Error: ${tool} not found" >&2; exit 1; }
done
if [[ -n "${R2_ENDPOINT:-}" ]]; then
  command -v aws >/dev/null 2>&1 || { echo "Error: aws CLI not found" >&2; exit 1; }
  s3() { aws s3api --endpoint-url "${R2_ENDPOINT}" --region auto --output json "$@"; }
fi

# Prints one object key per line for a namespace.
list_keys() {
  local ns="$1"
  if [[ -n "${R2_ENDPOINT:-}" ]]; then
    for prefix in 3d/ renders/; do
      s3 list-objects-v2 --bucket "${R2_BUCKET}" --prefix "${ns}/maps/${prefix}" --query 'Contents[].Key' | jq -r '.[]? // empty'
    done
    return
  fi
  for manifest in manifest.json manifest.meshes.json manifest.renders.json; do
    curl -fsS "${CDN_BASE}/${ns}/maps/${manifest}" 2>/dev/null || true
  done | jq -r '.. | objects | .path? // empty | strings | select(startswith("3d/") or startswith("renders/"))' \
    | sed "s|^|${ns}/maps/|"
}

# Prints "<cache-control>|<content-type>" for a key.
read_headers() {
  local key="$1"
  if [[ -n "${R2_ENDPOINT:-}" ]]; then
    s3 head-object --bucket "${R2_BUCKET}" --key "${key}" | jq -r '"\(.CacheControl // "")|\(.ContentType // "")"'
    return
  fi
  # A one-byte GET: R2 answers HEAD and GET alike, and GET matches what the browser caches.
  curl -fsS -o /dev/null -D - -r 0-0 "${CDN_BASE}/${key}" | tr -d '\r' | awk -F': ' '
    tolower($1) == "cache-control" { cc = $2 }
    tolower($1) == "content-type" { ct = $2 }
    END { printf "%s|%s\n", cc, ct }'
}

checked=0
affected=0
for ns in ${NAMESPACES}; do
  while IFS= read -r key; do
    [[ -n "${key}" ]] || continue
    checked=$((checked + 1))
    IFS='|' read -r cache_control content_type < <(read_headers "${key}")
    [[ "${cache_control}" == "${IMMUTABLE}" ]] && continue
    affected=$((affected + 1))
    printf '%s\tcache-control=%s\tcontent-type=%s\n' "${key}" "${cache_control:-<none>}" "${content_type:-<none>}"
    if [[ "${apply}" == true ]]; then
      s3 copy-object --bucket "${R2_BUCKET}" --key "${key}" --copy-source "${R2_BUCKET}/${key}" \
        --metadata-directive REPLACE --cache-control "${IMMUTABLE}" \
        ${content_type:+--content-type "${content_type}"} >/dev/null
      echo "  updated"
    fi
  done < <(list_keys "${ns}" | sort -u)
done

mode="dry run (nothing changed)"
[[ "${apply}" == true ]] && mode="applied"
source="published manifests via ${CDN_BASE}"
[[ -n "${R2_ENDPOINT:-}" ]] && source="bucket ${R2_BUCKET}"
echo "${mode}: ${affected} of ${checked} content-addressed objects lack '${IMMUTABLE}' (source: ${source})"
