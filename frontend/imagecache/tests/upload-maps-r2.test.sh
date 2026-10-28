#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/bin" "${tmp}/maps/original" "${tmp}/remote" "${tmp}/remote-turtle"
cat > "${tmp}/bin/rclone" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
map_path() {
  if [[ "$1" == r2:* ]]; then
    prefix="r2:icons/${R2_PATH}/"
    printf '%s/%s' "$MOCK_MAP_REMOTE" "${1#"$prefix"}"
  else
    printf '%s' "$1"
  fi
}
operation="$1"; shift
case "$operation" in
  copy)
    source="$(map_path "$1")"; destination="$(map_path "$2")"
    mkdir -p "$destination"
    cp -a "$source"/. "$destination"/
    ;;
  copyto)
    source="$(map_path "$1")"; destination="$(map_path "$2")"
    mkdir -p "$(dirname "$destination")"
    cp "$source" "$destination"
    ;;
  lsf)
    source="$(map_path "$1")"
    if [[ ! -d "$source" ]]; then
      echo "ERROR : error listing: directory not found" >&2
      exit 3
    fi
    find "$source" -maxdepth 1 -type f -printf '%f\n'
    ;;
  *) echo "unexpected rclone operation: $operation" >&2; exit 1 ;;
esac
MOCK
chmod +x "${tmp}/bin/rclone"
export PATH="${tmp}/bin:${PATH}" MOCK_MAP_REMOTE="${tmp}/remote"
export R2_REMOTE=r2 R2_BUCKET=icons R2_PATH=forever/maps SERVER=forever MAPS_DIR="${tmp}/maps"
printf 'tile' > "${MAPS_DIR}/original/1.webp"
cat > "${MAPS_DIR}/manifest.original.json" <<'JSON'
{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta","build":"1.0","region":"us","locale":"enUS"},"maps":[],"instances":[{"mapID":43,"name":"Wailing Caverns","instanceType":1,"directory":"wailingcaverns","floors":[]}]}
JSON
cd "$repo/frontend/imagecache"
MAPS_UPLOAD_MODE=original ./upload-maps-r2.sh >/dev/null
jq -e '.instances[0].renders == null and .instances[0].styled == null' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

MAPS_UPLOAD_MODE=styled ./upload-maps-r2.sh >/dev/null
jq -e '.instances[0].styled.path == "render-styled/43-wailing-caverns-v2.jpeg"' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

mkdir -p "${tmp}/meshes"
cat > "${tmp}/meshes/manifest.meshes.json" <<'JSON'
{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":43,"mesh":{"path":"3d/wailing-caverns-open-top.glb","bounds":{"minX":-389.07,"maxX":191.667,"minY":-370.833,"maxY":538.351},"zMin":-119.16,"zMax":56.469,"frame":"wow-yup-mirrored-x"}}]}
JSON
before="$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")"
if MESHES_DIR="${tmp}/meshes" MAPS_UPLOAD_MODE=meshes ./upload-maps-r2.sh >"${tmp}/failure.log" 2>&1; then
  echo "mesh manifest without its GLB unexpectedly published" >&2
  exit 1
fi
[[ "$before" == "$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")" ]]
printf 'glTF' > "${tmp}/meshes/wailing-caverns-open-top.glb"
# A checkout without generated maps still publishes the mesh layer.
MAPS_DIR="${tmp}/no-generated-maps" MESHES_DIR="${tmp}/meshes" MAPS_UPLOAD_MODE=meshes ./upload-maps-r2.sh >/dev/null
jq -e '.instances[0].mesh.path == "3d/wailing-caverns-open-top.glb" and .instances[0].mesh.frame == "wow-yup-mirrored-x" and .instances[0].mesh.bounds.minX == -389.07 and .instances[0].styled.path == "render-styled/43-wailing-caverns-v2.jpeg"' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null
[[ -f "$MOCK_MAP_REMOTE/3d/wailing-caverns-open-top.glb" ]]
# The manifest-only mode needs no GLB beside the manifest and uploads none.
rm "${tmp}/meshes/wailing-caverns-open-top.glb" "$MOCK_MAP_REMOTE/3d/wailing-caverns-open-top.glb"
MESHES_DIR="${tmp}/meshes" MAPS_UPLOAD_MODE=meshes-manifest ./upload-maps-r2.sh >/dev/null
[[ ! -e "$MOCK_MAP_REMOTE/3d/wailing-caverns-open-top.glb" ]]
jq -e '.instances[0].mesh.path == "3d/wailing-caverns-open-top.glb"' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

# Hand-uploaded PNGs are already remote; only their source manifest is published.
MAPS_UPLOAD_MODE=renders ./upload-maps-r2.sh >/dev/null
jq -e '([.instances[].renders.path] | sort) == (["renders/RFC-shaded.png", "renders/RoL-shaded-aligned.png", "renders/WC-shaded-water.png"] | sort) and .instances[0].mesh.path == "3d/wailing-caverns-open-top.glb" and .instances[0].styled != null and .instances[0].rendered == null and .instances[0]."3d" == null' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null
jq -e '([.instances[].mapID] | sort) == [43,389,2999] and (.instances[] | select(.mapID == 389) | .name == "Ragefire Chasm" and .floors == [])' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null
[[ -f "$MOCK_MAP_REMOTE/manifest.renders.json" && ! -e "$MOCK_MAP_REMOTE/manifest.rendered.json" && ! -e "$MOCK_MAP_REMOTE/manifest.3d.json" ]]

# Native refresh retains floorless manual instances and independent mesh metadata.
MAPS_UPLOAD_MODE=original ./upload-maps-r2.sh >/dev/null
jq -e '([.instances[].mapID] | sort) == [43,389,2999] and (.instances[] | select(.mapID == 2999) | .floors == [] and .renders.path == "renders/RoL-shaded-aligned.png")' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

before="$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")"
# An incompatible unchanged source layer aborts before remote writes.
cp "$MOCK_MAP_REMOTE/manifest.styled.json" "${tmp}/styled-good.json"
printf '{broken' > "$MOCK_MAP_REMOTE/manifest.styled.json"
if MAPS_UPLOAD_MODE=renders ./upload-maps-r2.sh >"${tmp}/failure.log" 2>&1; then
  echo "invalid styled layer unexpectedly published" >&2
  exit 1
fi
[[ "$before" == "$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")" ]]
cp "${tmp}/styled-good.json" "$MOCK_MAP_REMOTE/manifest.styled.json"
# Manual publication works after generated native files are cleaned locally.
rm -rf "$MAPS_DIR"
MAPS_UPLOAD_MODE=renders ./upload-maps-r2.sh >/dev/null
jq -e '.instances[0].renders.path == "renders/WC-shaded-water.png" and .instances[0].mesh.path == "3d/wailing-caverns-open-top.glb"' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

export R2_PATH=turtle/maps SERVER=turtle MAPS_DIR="${tmp}/turtle-maps" MOCK_MAP_REMOTE="${tmp}/remote-turtle"
mkdir -p "${MAPS_DIR}/original"
printf 'legacy tile' > "${MAPS_DIR}/original/2.webp"
cat > "${MAPS_DIR}/manifest.original.json" <<'JSON'
{"format":"chronicle-wow-map-art-v2","target":{"product":"turtle","build":"1.12.1"},"maps":[{"id":1411,"name":"Durotar","parentID":0,"type":3,"flags":0}],"instances":[]}
JSON
MAPS_UPLOAD_MODE=original ./upload-maps-r2.sh >/dev/null
jq -e '.format == "chronicle-wow-map-art-v2" and .target.product == "turtle" and (.maps|length) == 1' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null
[[ -f "$MOCK_MAP_REMOTE/original/2.webp" ]]

# A new server namespace can bootstrap from an original map upload.
export R2_PATH=vanillaplus/maps SERVER=vanillaplus MAPS_DIR="${tmp}/vanillaplus-maps" MOCK_MAP_REMOTE="${tmp}/remote-vanillaplus"
mkdir -p "${MAPS_DIR}/original"
printf 'legacy tile' > "${MAPS_DIR}/original/3.webp"
cat > "${MAPS_DIR}/manifest.original.json" <<'JSON'
{"format":"chronicle-wow-map-art-v2","target":{"product":"vanillaplus","build":"1.12.1"},"maps":[{"id":4,"name":"Durotar","parentID":0,"type":3,"flags":0}],"instances":[]}
JSON
MAPS_UPLOAD_MODE=original ./upload-maps-r2.sh >/dev/null
jq -e '.target.product == "vanillaplus" and (.maps|length) == 1' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null
[[ -f "$MOCK_MAP_REMOTE/original/3.webp" ]]

echo 'Map manifest upload modes passed'
