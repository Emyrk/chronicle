#!/usr/bin/env bash
# Export the spell and item icons referenced by a Chronicle wowdata snapshot.

set -euo pipefail

WOWDATA_BIN="${WOWDATA_BIN:-wowdata}"
CLIENT_PATH="${WOW_CLIENT_PATH:-}"
SNAPSHOT_DIR=""
OUT_DIR=""
CACHE_DIR="${WOWDATA_CACHE:-}"
LIMIT=0

usage() {
  cat <<'EOF'
Usage: scripts/dbcdata/extract-wowdata-icons.sh --snapshot DIR --client PATH --out DIR [options]

Export referenced WoW Forever spell and item icons directly as lossless WebP.
The snapshot must have been produced by extract-wowdata.sh and include icons.jsonl.

Options:
  --snapshot DIR     Extracted wowdata snapshot
  --client PATH      WoW installation root containing .build.info and Data/
  --out DIR          Destination directory for .webp files
  --wowdata PATH     wowdata executable (default: $WOWDATA_BIN or wowdata)
  --cache DIR        wowdata cache directory
  --limit N          Export at most N icons; useful for smoke tests
  -h, --help         Show this help
EOF
}

while (($# > 0)); do
  case "$1" in
    --snapshot) SNAPSHOT_DIR="$2"; shift 2 ;;
    --client) CLIENT_PATH="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --wowdata) WOWDATA_BIN="$2"; shift 2 ;;
    --cache) CACHE_DIR="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" || -z "$CLIENT_PATH" || -z "$OUT_DIR" ]]; then
  echo "--snapshot, --client, and --out are required" >&2
  usage >&2
  exit 2
fi
if [[ ! -f "$SNAPSHOT_DIR/manifest.json" || ! -f "$SNAPSHOT_DIR/icons.jsonl" ]]; then
  echo "Snapshot must contain manifest.json and icons.jsonl: $SNAPSHOT_DIR" >&2
  exit 2
fi
if [[ ! -f "$CLIENT_PATH/.build.info" || ! -d "$CLIENT_PATH/Data" ]]; then
  echo "Client path must contain .build.info and Data/: $CLIENT_PATH" >&2
  exit 2
fi
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo "--limit must be a non-negative integer" >&2
  exit 2
fi
for command in "$WOWDATA_BIN" python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 2
  fi
done

mkdir -p "$OUT_DIR"
plan="$(mktemp)"
trap 'rm -f "$plan"' EXIT
python3 - "$SNAPSHOT_DIR" "$LIMIT" >"$plan" <<'PY'
import json
import sys
from pathlib import Path

snapshot = Path(sys.argv[1])
limit = int(sys.argv[2])
manifest = json.loads((snapshot / "manifest.json").read_text())
icons = {}
with (snapshot / "icons.jsonl").open() as rows:
    for line in rows:
        row = json.loads(line)
        name = row.get("fileName", "").replace("\\", "/").lower()
        if not name.startswith("interface/icons/") or not name.endswith(".blp"):
            continue
        texture = name.removeprefix("interface/icons/").removesuffix(".blp")
        if texture and "/" not in texture:
            icons[int(row["fileDataID"])] = texture

referenced = set()
for table, fields in (("SpellMisc", ("SpellIconFileDataID", "ActiveIconFileDataID")), ("Item", ("IconFileDataID",))):
    with (snapshot / "tables" / f"{table}.jsonl").open() as rows:
        for line in rows:
            row = json.loads(line)
            referenced.update(int(row.get(field, 0)) for field in fields if row.get(field, 0))

entries = sorted((file_id, icons[file_id]) for file_id in referenced if file_id in icons)
if limit:
    entries = entries[:limit]
for file_id, texture in entries:
    print(f"{file_id}\t{texture}")
missing = len(referenced - icons.keys())
print(f"Resolved {len(entries)} referenced icons; {missing} FileDataIDs had no listfile path", file=sys.stderr)
print(json.dumps({"product": manifest["target"]["product"], "build": manifest["target"]["buildName"], "locale": manifest["target"].get("locale", "enUS")}), file=sys.stderr)
PY

readarray -t target < <(python3 - "$SNAPSHOT_DIR/manifest.json" <<'PY'
import json
import sys
m = json.load(open(sys.argv[1]))
print(m["target"].get("region", "us"))
print(m["target"]["product"])
print(m["target"]["buildName"])
print(m["target"].get("locale", "enUS"))
PY
)
COMMON_ARGS=(
  --source local
  --region "${target[0]}"
  --product "${target[1]}"
  --build "${target[2]}"
  --locale "${target[3]}"
  --path "$CLIENT_PATH"
)
if [[ -n "$CACHE_DIR" ]]; then
  COMMON_ARGS+=(--cache "$CACHE_DIR")
fi

total=$(wc -l <"$plan")
current=0
failed=0
while IFS=$'\t' read -r file_data_id texture; do
  current=$((current + 1))
  output="$OUT_DIR/${texture}.webp"
  if [[ -s "$output" ]]; then
    continue
  fi
  tmp="${output}.tmp"
  if "$WOWDATA_BIN" icon export --file-data-id "$file_data_id" --format webp --output "$tmp" "${COMMON_ARGS[@]}" >/dev/null; then
    mv "$tmp" "$output"
  else
    rm -f "$tmp"
    echo "Failed: FileDataID=$file_data_id texture=$texture" >&2
    failed=$((failed + 1))
  fi
  if ((current % 100 == 0 || current == total)); then
    echo "Exported $current/$total referenced icons ($failed failed)"
  fi
done <"$plan"

if ((failed > 0)); then
  echo "Warning: $failed referenced FileDataIDs were listed but unavailable in this client build" >&2
fi

echo "Exported $((total - failed))/$total referenced icons to $OUT_DIR"
