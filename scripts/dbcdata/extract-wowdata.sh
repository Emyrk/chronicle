#!/usr/bin/env bash
# Extract the modern DB2 tables needed to reconstruct Chronicle dataset data.
#
# This is an extraction step only. It does not transform modern DB2 rows into
# Chronicle's legacy DBC-shaped upload models or upload them to a server.

set -euo pipefail

WOWDATA_BIN="${WOWDATA_BIN:-wowdata}"
CLIENT_PATH="${WOW_CLIENT_PATH:-}"
PRODUCT="${WOW_PRODUCT:-wow_classic_beta}"
BUILD="${WOW_BUILD:-1.60.1.69913}"
REGION="${WOW_REGION:-us}"
LOCALE="${WOW_LOCALE:-enUS}"
CACHE_DIR="${WOWDATA_CACHE:-}"
OUT_DIR=""
LIMIT=0

usage() {
  cat <<'EOF'
Usage: scripts/dbcdata/extract-wowdata.sh --client PATH [options]

Extract modern WoW DB2 tables as normalized JSONL rows plus schema metadata.

Required:
  --client PATH       WoW installation root containing .build.info and Data/

Options:
  --wowdata PATH      wowdata executable (default: $WOWDATA_BIN or wowdata)
  --product PRODUCT   CASC product (default: wow_classic_beta)
  --build BUILD       Build version/key (default: 1.60.1.69913)
  --region REGION     Blizzard region (default: us)
  --locale LOCALE     Data locale (default: enUS)
  --cache DIR         wowdata cache directory
  --out DIR           Output directory (default: ./export/wowdata-PRODUCT-BUILD)
  --limit N           Extract at most N rows per table; useful for smoke tests
  -h, --help          Show this help

Environment equivalents:
  WOWDATA_BIN, WOW_CLIENT_PATH, WOW_PRODUCT, WOW_BUILD, WOW_REGION,
  WOW_LOCALE, WOWDATA_CACHE

The output is an intermediate snapshot, not an upload artifact. Chronicle still
needs version-aware transforms that join the split modern Spell and Item tables.
EOF
}

while (($# > 0)); do
  case "$1" in
    --client) CLIENT_PATH="$2"; shift 2 ;;
    --wowdata) WOWDATA_BIN="$2"; shift 2 ;;
    --product) PRODUCT="$2"; shift 2 ;;
    --build) BUILD="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --locale) LOCALE="$2"; shift 2 ;;
    --cache) CACHE_DIR="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$CLIENT_PATH" ]]; then
  echo "--client is required" >&2
  usage >&2
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

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="./export/wowdata-${PRODUCT}-${BUILD}"
fi
# Only remove files owned by this script so reruns cannot retain stale tables.
rm -rf "$OUT_DIR/schemas" "$OUT_DIR/tables" "$OUT_DIR/logs"
rm -f "$OUT_DIR/manifest.json" "$OUT_DIR/target.json" "$OUT_DIR/icons.jsonl" \
  "$OUT_DIR/skipped-optional-tables.txt"
mkdir -p "$OUT_DIR/schemas" "$OUT_DIR/tables" "$OUT_DIR/logs"

# These include direct successors of the DBCs in Importer.Registry plus the
# component tables required because modern clients split Spell.dbc and item
# cache records across many DB2 tables.
REQUIRED_TABLES=(
  Talent
  TalentTab

  Spell
  SpellName
  SpellMisc
  SpellEffect
  SpellAuraOptions
  SpellAuraRestrictions
  SpellCastingRequirements
  SpellCategories
  SpellClassOptions
  SpellCooldowns
  SpellEquippedItems
  SpellInterrupts
  SpellLevels
  SpellPower
  SpellReagents
  SpellShapeshift
  SpellTargetRestrictions
  SpellTotems
  SpellXDescriptionVariables

  SpellCastTimes
  SpellDuration
  SpellRange
  SpellCategory
  SpellRadius
  SpellFocusObject
  SpellDescriptionVariables

  Item
  ItemSparse
  ItemEffect
  ItemDisplayInfo
  SpellItemEnchantment
  ItemSet
)

# These are part of Chronicle's legacy dataset import, but the Forever beta's
# CASC root has no locale entry for them. Icon FileDataIDs now live on tables
# such as SpellMisc/Item; random-property reconstruction needs separate work.
OPTIONAL_TABLES=(
  SpellIcon
  ItemRandomProperties
)

COMMON_ARGS=(
  --source local
  --region "$REGION"
  --product "$PRODUCT"
  --build "$BUILD"
  --locale "$LOCALE"
  --path "$CLIENT_PATH"
)
if [[ -n "$CACHE_DIR" ]]; then
  COMMON_ARGS+=(--cache "$CACHE_DIR")
fi

unwrap_data() {
  python3 -c '
import json
import sys

document = json.load(sys.stdin)
if not document.get("ok"):
    error = document.get("error") or {}
    raise SystemExit(error.get("message", "wowdata command failed"))
json.dump(document["data"], sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
'
}

unwrap_rows() {
  python3 -c '
import json
import sys

for line_number, line in enumerate(sys.stdin, 1):
    if not line.strip():
        continue
    document = json.loads(line)
    if not document.get("ok"):
        error = document.get("error") or {}
        raise SystemExit(error.get("message", "wowdata stream failed"))
    row = document.get("data", {}).get("row")
    if row is None:
        raise SystemExit(f"wowdata stream line {line_number} has no data.row")
    print(json.dumps(row, separators=(",", ":"), sort_keys=True))
'
}

unwrap_icon_files() {
  python3 -c '
import json
import sys

document = json.load(sys.stdin)
if not document.get("ok"):
    error = document.get("error") or {}
    raise SystemExit(error.get("message", "wowdata file search failed"))
for entry in document.get("data", {}).get("files", []):
    name = entry.get("fileName", "")
    if name.lower().startswith("interface/icons/") and name.lower().endswith(".blp"):
        print(json.dumps({"fileDataID": entry["fileDataID"], "fileName": name}, separators=(",", ":"), sort_keys=True))
'
}

extract_table() {
  local table="$1"
  local required="$2"
  local schema_tmp="$OUT_DIR/schemas/.${table}.json.tmp"
  local table_tmp="$OUT_DIR/tables/.${table}.jsonl.tmp"
  local log="$OUT_DIR/logs/${table}.log"
  local -a stream_args=(db2 stream "$table" --format jsonl)

  if ((LIMIT > 0)); then
    stream_args+=(--limit "$LIMIT")
  fi

  echo "==> $table"
  if ! "$WOWDATA_BIN" db2 schema "$table" "${COMMON_ARGS[@]}" \
      2>"$log" | unwrap_data >"$schema_tmp"; then
    rm -f "$schema_tmp" "$table_tmp"
    if [[ "$required" == "required" ]]; then
      echo "Required table failed: $table (see $log)" >&2
      return 1
    fi
    echo "    skipped optional table (see $log)"
    printf '%s\n' "$table" >>"$OUT_DIR/skipped-optional-tables.txt"
    return 0
  fi

  if ! "$WOWDATA_BIN" "${stream_args[@]}" "${COMMON_ARGS[@]}" \
      2>>"$log" | unwrap_rows >"$table_tmp"; then
    rm -f "$schema_tmp" "$table_tmp"
    if [[ "$required" == "required" ]]; then
      echo "Required table stream failed: $table (see $log)" >&2
      return 1
    fi
    echo "    skipped optional table during stream (see $log)"
    printf '%s\n' "$table" >>"$OUT_DIR/skipped-optional-tables.txt"
    return 0
  fi

  mv "$schema_tmp" "$OUT_DIR/schemas/${table}.json"
  mv "$table_tmp" "$OUT_DIR/tables/${table}.jsonl"
  echo "    $(wc -l <"$OUT_DIR/tables/${table}.jsonl") rows"
}

rm -f "$OUT_DIR/skipped-optional-tables.txt"

info_tmp="$OUT_DIR/.target.json.tmp"
"$WOWDATA_BIN" casc info "${COMMON_ARGS[@]}" \
  2>"$OUT_DIR/logs/casc-info.log" | unwrap_data >"$info_tmp"
mv "$info_tmp" "$OUT_DIR/target.json"

for table in "${REQUIRED_TABLES[@]}"; do
  extract_table "$table" required
done
for table in "${OPTIONAL_TABLES[@]}"; do
  extract_table "$table" optional
done

icons_tmp="$OUT_DIR/.icons.jsonl.tmp"
echo "==> Interface icons"
if "$WOWDATA_BIN" file search --query interface/icons --limit 100000 --listfile "${COMMON_ARGS[@]}" \
    2>"$OUT_DIR/logs/icons.log" | unwrap_icon_files >"$icons_tmp"; then
  mv "$icons_tmp" "$OUT_DIR/icons.jsonl"
  echo "    $(wc -l <"$OUT_DIR/icons.jsonl") listfile entries"
else
  rm -f "$icons_tmp"
  echo "    warning: icon listfile extraction failed (see $OUT_DIR/logs/icons.log)" >&2
fi

WOWDATA_VERSION="$($WOWDATA_BIN --version 2>/dev/null || true)" \
OUTPUT_DIR="$OUT_DIR" \
EXTRACT_LIMIT="$LIMIT" \
python3 - <<'PY'
import json
import os
from pathlib import Path

out = Path(os.environ["OUTPUT_DIR"])
target = json.loads((out / "target.json").read_text())
tables = []
for path in sorted((out / "tables").glob("*.jsonl")):
    schema_path = out / "schemas" / f"{path.stem}.json"
    schema = json.loads(schema_path.read_text())
    with path.open() as rows:
        extracted = sum(1 for _ in rows)
    tables.append({
        "name": path.stem,
        "availableRows": schema.get("rowCount"),
        "extractedRows": extracted,
        "schema": str(schema_path.relative_to(out)),
        "rows": str(path.relative_to(out)),
    })

skipped_path = out / "skipped-optional-tables.txt"
skipped = skipped_path.read_text().splitlines() if skipped_path.exists() else []
icons_path = out / "icons.jsonl"
icons = None
if icons_path.exists():
    with icons_path.open() as rows:
        icons = {
            "rows": str(icons_path.relative_to(out)),
            "count": sum(1 for _ in rows),
        }
manifest = {
    "format": "chronicle-wowdata-snapshot-v1",
    "target": target,
    "wowdataVersion": os.environ.get("WOWDATA_VERSION", ""),
    "rowLimit": int(os.environ["EXTRACT_LIMIT"]),
    "tables": tables,
    "icons": icons,
    "skippedOptionalTables": skipped,
    "notes": [
        "Rows are extracted modern DB2 records, not Chronicle upload artifacts.",
        "Modern Spell and Item data must be joined and normalized before dataset upload.",
        "DBCache.bin hotfixes are not applied by this extraction script.",
    ],
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
PY

echo
echo "Extracted ${#REQUIRED_TABLES[@]} required table(s) to $OUT_DIR"
if [[ -s "$OUT_DIR/skipped-optional-tables.txt" ]]; then
  echo "Skipped optional table(s): $(paste -sd, "$OUT_DIR/skipped-optional-tables.txt")"
fi
echo "Manifest: $OUT_DIR/manifest.json"
