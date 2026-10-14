#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/bin" "${tmp}/maps/original" "${tmp}/maps/render" "${tmp}/remote" "${tmp}/remote-turtle"
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
jq -e '.instances[0].rendered == null and .instances[0].styled == null' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

MAPS_UPLOAD_MODE=styled ./upload-maps-r2.sh >/dev/null
jq -e '.instances[0].styled.path == "render-styled/43-wailing-caverns-v2.jpeg"' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

mkdir -p "${tmp}/meshes"
cat > "${tmp}/meshes/manifest.meshes.json" <<'JSON'
{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":43,"mesh":{"path":"meshes/43.glb","bounds":{"minX":-389.07,"maxX":191.667,"minY":-370.833,"maxY":538.351},"zMin":-119.16,"zMax":56.469,"frame":"wow-yup-mirrored-x"}}]}
JSON
before="$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")"
if MESHES_DIR="${tmp}/meshes" MAPS_UPLOAD_MODE=meshes ./upload-maps-r2.sh >"${tmp}/failure.log" 2>&1; then
  echo "mesh manifest without its GLB unexpectedly published" >&2
  exit 1
fi
[[ "$before" == "$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")" ]]
printf 'glTF' > "${tmp}/meshes/43.glb"
# A checkout without generated maps still publishes the mesh layer.
MAPS_DIR="${tmp}/no-generated-maps" MESHES_DIR="${tmp}/meshes" MAPS_UPLOAD_MODE=meshes ./upload-maps-r2.sh >/dev/null
jq -e '.instances[0].mesh.path == "meshes/43.glb" and .instances[0].mesh.frame == "wow-yup-mirrored-x" and .instances[0].mesh.bounds.minX == -389.07 and .instances[0].styled.path == "render-styled/43-wailing-caverns-v2.jpeg"' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null
[[ -f "$MOCK_MAP_REMOTE/meshes/43.glb" ]]

printf 'png' > "${MAPS_DIR}/render/43.png"
cat > "${MAPS_DIR}/manifest.rendered.json" <<'JSON'
{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta","build":"1.0","region":"us","locale":"enUS"},"instances":[{"mapID":43,"rendered":{"path":"render/43.png","width":1200,"height":800,"source":"wmo","bounds":{"minX":0,"maxX":1,"minY":0,"maxY":1}}}]}
JSON
MAPS_UPLOAD_MODE=rendered ./upload-maps-r2.sh >/dev/null
jq -e '.instances[0].rendered.path == "render/43.png" and .instances[0].styled.path == "render-styled/43-wailing-caverns-v2.jpeg" and .instances[0].mesh.path == "meshes/43.glb"' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null

before="$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")"
printf '{broken' > "${MAPS_DIR}/manifest.rendered.json"
if MAPS_UPLOAD_MODE=rendered ./upload-maps-r2.sh >"${tmp}/failure.log" 2>&1; then
  echo "invalid rendered layer unexpectedly published" >&2
  exit 1
fi
[[ "$before" == "$(sha256sum "$MOCK_MAP_REMOTE/manifest.json")" ]]
jq -e '.instances[0].rendered.path == "render/43.png"' "$MOCK_MAP_REMOTE/manifest.rendered.json" >/dev/null
export R2_PATH=turtle/maps SERVER=turtle MAPS_DIR="${tmp}/turtle-maps" MOCK_MAP_REMOTE="${tmp}/remote-turtle"
mkdir -p "${MAPS_DIR}/original"
printf 'legacy tile' > "${MAPS_DIR}/original/2.webp"
cat > "${MAPS_DIR}/manifest.original.json" <<'JSON'
{"format":"chronicle-wow-map-art-v2","target":{"product":"turtle","build":"1.12.1"},"maps":[{"id":1411,"name":"Durotar","parentID":0,"type":3,"flags":0}],"instances":[]}
JSON
MAPS_UPLOAD_MODE=original ./upload-maps-r2.sh >/dev/null
jq -e '.format == "chronicle-wow-map-art-v2" and .target.product == "turtle" and (.maps|length) == 1' "$MOCK_MAP_REMOTE/manifest.json" >/dev/null
[[ -f "$MOCK_MAP_REMOTE/original/2.webp" ]]

echo 'Map manifest upload modes passed'
