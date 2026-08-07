#!/usr/bin/env bash
#
# fetch-fixtures.sh — Fetch live Chronicle instance data for local debugging.
#
# Usage:
#   ./scripts/fetch-fixtures/fetch-fixtures.sh [OPTIONS] <slug|url> [slug|url ...]
#   ./scripts/fetch-fixtures/fetch-fixtures.sh [OPTIONS] -f <file>
#
# Options:
#   -b, --base-url URL   Chronicle API base URL (default: https://chronicle.gg)
#   -f, --file FILE      Read slugs/URLs from FILE (one per line, # comments ok)
#   -o, --out-dir DIR    Output directory (default: scripts/fetch-fixtures/data)
#   -s, --streams LIST   Comma-separated event streams to fetch
#                        (default: damage)
#                        Available: damage,heal,cast,aura,slain,resource_change,extra_attack
#   -h, --help           Show this help message
#
# Each slug produces:
#   <out-dir>/<slug>/instance.json
#   <out-dir>/<slug>/damage.bin   (or other requested streams)
#   <out-dir>/<slug>/manifest.json
#
# The data directory is gitignored — never commit fetched live data.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DEFAULT_BASE_URL="https://chronicle.gg"
DEFAULT_OUT_DIR="$SCRIPT_DIR/data"
DEFAULT_STREAMS="damage"
VALID_STREAMS="damage heal cast aura slain resource_change extra_attack"

# Slug format: alphanumeric + hyphens + underscores, 4-64 chars.
SLUG_PATTERN='^[A-Za-z0-9_-]{4,64}$'

base_url="$DEFAULT_BASE_URL"
out_dir="$DEFAULT_OUT_DIR"
streams="$DEFAULT_STREAMS"
slug_file=""
slugs=()

usage() {
  sed -n '3,/^$/{ s/^# \?//; p }' "$0"
  exit "${1:-0}"
}

die() {
  echo "error: $*" >&2
  exit 1
}

# normalize_slug extracts a slug from a full URL or validates a bare slug.
#   Input: "https://chronicle.gg/instances/OKry7FkxJjc2Yzgf" → "OKry7FkxJjc2Yzgf"
#   Input: "/api/v1/raidlogs/instances/OKry7FkxJjc2Yzgf" → "OKry7FkxJjc2Yzgf"
#   Input: "OKry7FkxJjc2Yzgf" → "OKry7FkxJjc2Yzgf"
normalize_slug() {
  local input="$1"

  # Strip trailing slash / whitespace.
  input="${input%/}"
  input="${input## }"
  input="${input%% }"

  # Extract slug from URL paths.
  if [[ "$input" =~ /instances/([A-Za-z0-9_-]+)(/|$) ]]; then
    input="${BASH_REMATCH[1]}"
  elif [[ "$input" =~ ^https?:// ]]; then
    die "cannot extract slug from URL: $input"
  fi

  # Strip any remaining path segments (e.g. /events/damage suffix).
  input="${input%%/*}"

  # Validate.
  if [[ ! "$input" =~ $SLUG_PATTERN ]]; then
    die "invalid slug: '$input' (must match $SLUG_PATTERN)"
  fi

  echo "$input"
}

validate_stream() {
  local s="$1"
  for v in $VALID_STREAMS; do
    [[ "$s" == "$v" ]] && return 0
  done
  die "invalid stream '$s'; valid streams: $VALID_STREAMS"
}

# fetch_url downloads a URL to a temp file, then atomically moves it to dest.
# Returns non-zero on HTTP error.
fetch_url() {
  local url="$1" dest="$2" label="$3"
  local tmp="${dest}.tmp.$$"
  local http_code

  http_code=$(curl -sS -w '%{http_code}' -o "$tmp" "$url") || {
    rm -f "$tmp"
    echo "  ✗ $label: curl failed" >&2
    return 1
  }

  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    rm -f "$tmp"
    echo "  ✗ $label: HTTP $http_code" >&2
    return 1
  fi

  mv "$tmp" "$dest"
  local size
  size=$(wc -c < "$dest" | tr -d ' ')
  echo "  ✓ $label ($size bytes)"
  return 0
}

# ── Parse arguments ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--base-url) base_url="${2:?missing base-url}"; shift 2 ;;
    -f|--file)     slug_file="${2:?missing file}"; shift 2 ;;
    -o|--out-dir)  out_dir="${2:?missing out-dir}"; shift 2 ;;
    -s|--streams)  streams="${2:?missing streams}"; shift 2 ;;
    -h|--help)     usage 0 ;;
    -*)            die "unknown option: $1" ;;
    *)             slugs+=("$1"); shift ;;
  esac
done

# Read slugs from file if provided.
if [[ -n "$slug_file" ]]; then
  [[ -f "$slug_file" ]] || die "file not found: $slug_file"
  while IFS= read -r line; do
    line="${line%%#*}"          # strip comments
    line="${line## }"; line="${line%% }"  # trim
    [[ -z "$line" ]] && continue
    slugs+=("$line")
  done < "$slug_file"
fi

[[ ${#slugs[@]} -gt 0 ]] || { echo "error: no slugs provided" >&2; usage 1; }

# Strip trailing slash from base URL.
base_url="${base_url%/}"

# Parse and validate streams.
IFS=',' read -ra stream_list <<< "$streams"
for s in "${stream_list[@]}"; do
  validate_stream "$s"
done

# ── Fetch each instance ─────────────────────────────────────────────────────

ok=0
fail=0

for raw_slug in "${slugs[@]}"; do
  slug=$(normalize_slug "$raw_slug") || { ((fail++)); continue; }

  echo "→ $slug"

  slug_dir="$out_dir/$slug"
  mkdir -p "$slug_dir"

  instance_url="$base_url/api/v1/raidlogs/instances/$slug"
  instance_ok=true

  if ! fetch_url "$instance_url" "$slug_dir/instance.json" "instance.json"; then
    instance_ok=false
  fi

  for stream in "${stream_list[@]}"; do
    stream_url="$instance_url/events/$stream"
    if ! fetch_url "$stream_url" "$slug_dir/$stream.bin" "$stream.bin"; then
      instance_ok=false
    fi
  done

  # Write manifest.
  cat > "$slug_dir/manifest.json" <<EOF
{
  "slug": "$slug",
  "source_url": "$instance_url",
  "base_url": "$base_url",
  "streams": [$(printf '"%s",' "${stream_list[@]}" | sed 's/,$//')],
  "fetched_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  if $instance_ok; then
    ((ok++))
    echo "  ✓ manifest.json"
  else
    ((fail++))
    echo "  ⚠ manifest written but some fetches failed"
  fi
done

echo ""
echo "Done: $ok succeeded, $fail failed."
[[ $fail -eq 0 ]]
