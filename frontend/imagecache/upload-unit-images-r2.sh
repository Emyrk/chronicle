#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAN="${1:-}"
PUBLISH="${2:-}"

if [[ -z "$PLAN" || ( "$PUBLISH" != "" && "$PUBLISH" != "--publish" ) ]]; then
  echo "Usage: $0 plan.json [--publish]" >&2
  exit 1
fi
if [[ ! -f "$PLAN" ]]; then
  echo "Plan not found: $PLAN" >&2
  exit 1
fi

if [[ -f "${SCRIPT_DIR}/.envrc" ]]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.envrc"
fi

R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET-icons}"
R2_PATH="${R2_PATH-unit-images}"
CDN_BASE="${CDN_BASE-https://icons.chronicleclassic.com}"
MANIFEST_URL="${UNIT_IMAGE_MANIFEST_URL-${CDN_BASE%/}/${R2_PATH#/}/manifest.json}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

python3 - "$PLAN" "$MANIFEST_URL" "$STAGE" <<'PY'
import hashlib
import json
import mimetypes
import pathlib
import re
import shutil
import sys
import urllib.error
import urllib.request

plan_path, manifest_url, stage_path = sys.argv[1:]
stage = pathlib.Path(stage_path)
assets = stage / "assets"
assets.mkdir(parents=True)
label_re = re.compile(r"^[a-z][a-z0-9_-]*$")
image_extensions = {".avif", ".jpeg", ".jpg", ".png", ".webp"}
model_extensions = {".glb"}

try:
    request = urllib.request.Request(manifest_url, headers={"User-Agent": "Chronicle unit image publisher"})
    with urllib.request.urlopen(request) as response:
        manifest = json.load(response)
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
    manifest = {"format": "chronicle-unit-images-v1", "units": []}
except FileNotFoundError:
    manifest = {"format": "chronicle-unit-images-v1", "units": []}

if manifest.get("format") != "chronicle-unit-images-v1" or not isinstance(manifest.get("units"), list):
    raise SystemExit("live unit image manifest has an unsupported shape")

plan = json.loads(pathlib.Path(plan_path).read_text())
if not isinstance(plan, list) or not plan:
    raise SystemExit("plan must be a non-empty JSON array")

units = manifest["units"]
for raw in plan:
    if not isinstance(raw, dict):
        raise SystemExit("every plan entry must be an object")
    name = str(raw.get("name", "")).strip()
    display_name = raw.get("display_name")
    if display_name is not None:
        if not isinstance(display_name, str) or not display_name.strip():
            raise SystemExit(f"{name or 'unit'}: display_name must be a non-blank string")
        display_name = display_name.strip()
    entry_ids = raw.get("entry_ids")
    image_files = raw.get("images")
    model_files = raw.get("models")
    if not name or not isinstance(entry_ids, list) or not entry_ids:
        raise SystemExit("every plan entry needs a name and entry_ids")
    if any(not isinstance(entry, int) or isinstance(entry, bool) or entry <= 0 or entry > 0xFFFFFFFF for entry in entry_ids):
        raise SystemExit(f"{name}: invalid entry ID")
    if len(set(entry_ids)) != len(entry_ids):
        raise SystemExit(f"{name}: duplicate entry ID")

    existing = next((index for index, unit in enumerate(units) if unit.get("name") == name), None)
    if image_files is None:
        if existing is None:
            raise SystemExit(f"{name}: images are required for a new unit")
        images = dict(units[existing].get("images") or {})
    else:
        if not isinstance(image_files, dict) or not image_files:
            raise SystemExit(f"{name}: images must be a non-empty label-to-file object")
        images = {}
        for label, filename in image_files.items():
            if not label_re.fullmatch(label):
                raise SystemExit(f"{name}: invalid image label {label!r}")
            source = pathlib.Path(filename).expanduser().resolve()
            if not source.is_file() or source.suffix.lower() not in image_extensions:
                raise SystemExit(f"{name}/{label}: unsupported or missing image {source}")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            asset_name = f"{digest}-{source.name.lower()}"
            shutil.copyfile(source, assets / asset_name)
            images[label] = f"unit-images/{asset_name}"

    if model_files is None:
        models = dict(units[existing].get("models") or {}) if existing is not None else {}
    else:
        if not isinstance(model_files, dict) or not model_files:
            raise SystemExit(f"{name}: models must be a non-empty label-to-file object")
        models = {}
        for label, filename in model_files.items():
            if not label_re.fullmatch(label):
                raise SystemExit(f"{name}: invalid model label {label!r}")
            source = pathlib.Path(filename).expanduser().resolve()
            if not source.is_file() or source.suffix.lower() not in model_extensions:
                raise SystemExit(f"{name}/{label}: unsupported or missing model {source}")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            asset_name = f"{digest}-{source.name.lower()}"
            shutil.copyfile(source, assets / asset_name)
            models[label] = f"unit-images/{asset_name}"

    entry = {"name": name, "entry_ids": entry_ids, "images": images}
    if models:
        entry["models"] = models
    if display_name is not None:
        entry["display_name"] = display_name
    elif existing is not None and units[existing].get("display_name") is not None:
        entry["display_name"] = units[existing]["display_name"]
    print(("replace " if existing is not None else "add     ") + name)
    if existing is None:
        units.append(entry)
    else:
        units[existing] = entry

names = set()
display_names = set()
assigned = {}
paths = set()
for unit in units:
    name = unit.get("name")
    if not isinstance(name, str) or not name or name in names:
        raise SystemExit(f"duplicate or invalid unit name: {name!r}")
    names.add(name)
    display_name = unit.get("display_name")
    if display_name is not None:
        if not isinstance(display_name, str) or not display_name.strip():
            raise SystemExit(f"{name}: invalid display_name")
        normalized = display_name.strip().casefold()
        if normalized in display_names:
            raise SystemExit(f"duplicate unit display_name: {display_name}")
        display_names.add(normalized)
    if not isinstance(unit.get("entry_ids"), list) or not unit["entry_ids"]:
        raise SystemExit(f"{name}: missing entry IDs")
    for entry_id in unit["entry_ids"]:
        previous = assigned.get(entry_id)
        if previous is not None and previous != name:
            raise SystemExit(f"entry ID {entry_id} belongs to both {previous} and {name}")
        assigned[entry_id] = name
    if not isinstance(unit.get("images"), dict) or not unit["images"]:
        raise SystemExit(f"{name}: missing images")
    for label, asset_path in unit["images"].items():
        if not label_re.fullmatch(label) or not isinstance(asset_path, str):
            raise SystemExit(f"{name}: invalid image mapping")
        if not re.fullmatch(r"unit-images/[^/\\]+\.(?:avif|jpe?g|png|webp)", asset_path):
            raise SystemExit(f"{name}/{label}: invalid asset path {asset_path!r}")
        if asset_path in paths:
            raise SystemExit(f"duplicate image path: {asset_path}")
        paths.add(asset_path)

    models = unit.get("models")
    if models is not None:
        if not isinstance(models, dict) or not models:
            raise SystemExit(f"{name}: invalid models")
        for label, asset_path in models.items():
            if not label_re.fullmatch(label) or not isinstance(asset_path, str):
                raise SystemExit(f"{name}: invalid model mapping")
            if not re.fullmatch(r"unit-images/[^/\\]+\.glb", asset_path):
                raise SystemExit(f"{name}/{label}: invalid model path {asset_path!r}")

units.sort(key=lambda unit: unit["name"])
(stage / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
model_refs = sum(len(unit.get("models", {})) for unit in units)
print(f"manifest: {len(units)} units, {len(assigned)} entry IDs, {len(paths)} images, {model_refs} model refs")
for asset in sorted(assets.iterdir()):
    mime = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
    print(f"asset: {asset.name} ({asset.stat().st_size} bytes, {mime})")
PY

cat "$STAGE/manifest.json"

if [[ "$PUBLISH" != "--publish" ]]; then
  echo "Dry run only. Re-run with --publish to upload assets and publish manifest.json last."
  exit 0
fi

upload_file() {
  local source="$1"
  local name="$2"
  local content_type="$3"
  local cache_control="$4"
  if [[ "$UPLOAD_TOOL" == "rclone" ]]; then
    rclone copyto "$source" "${R2_REMOTE}:${R2_BUCKET%/}/${R2_PATH#/}/${name}" \
      --header-upload "Cache-Control: ${cache_control}" \
      --header-upload "Content-Type: ${content_type}"
  else
    pnpm -C "${SCRIPT_DIR}/../telemetry" exec wrangler r2 object put \
      "${R2_BUCKET%/}/${R2_PATH#/}/${name}" --file "$source" --content-type "$content_type" \
      --cache-control "$cache_control" --remote --force
  fi
}

if command -v rclone >/dev/null && rclone listremotes | grep -qx "${R2_REMOTE}:"; then
  UPLOAD_TOOL="rclone"
elif command -v pnpm >/dev/null && [[ -x "${SCRIPT_DIR}/../telemetry/node_modules/.bin/wrangler" ]]; then
  UPLOAD_TOOL="wrangler"
else
  echo "publishing requires either configured rclone remote '${R2_REMOTE}:' or frontend/telemetry's Wrangler install" >&2
  exit 1
fi

for asset in "$STAGE"/assets/*; do
  content_type="$(python3 -c 'import mimetypes,sys; print(mimetypes.guess_type(sys.argv[1])[0] or "application/octet-stream")' "$asset")"
  upload_file "$asset" "$(basename "$asset")" "$content_type" "public, max-age=31536000, immutable"
done
upload_file "$STAGE/manifest.json" "manifest.json" "application/json" "public, max-age=3600"

echo "Published: ${CDN_BASE%/}/${R2_PATH#/}/manifest.json"
