#!/bin/bash
# usage: texglb.sh <dungeon> <boss>   (runs inside the configured workdir; PY=<interpreter> overrides python3.12)
# raw-textured.glb -> textured web.glb (draco, 2048 webp, ~150K tris) + play.glb (meshopt, 1024 webp, ~15K tris)
# -> play-grounded.glb (base at y=0, footprint diameter 1: the shape Chronicle's MapScene3D expects). Upload play-grounded.glb.
HERE=$(cd "$(dirname "$0")" && pwd); PY=${PY:-python3.12}
cd "$($PY "$HERE/../../../../scripts/mini-maker/scripts/mini_lib/config.py" --workdir)" || exit 1
D=$1; b=$2; T=dungeons/$D/$b/textured; G="npx -y @gltf-transform/cli@4.5.0"
tris=$($G inspect $T/raw-textured.glb --format md 2>/dev/null | grep '| TRIANGLES' | head -1 | awk -F'|' '{gsub(/[ ,]/,"",$6); print $6}')
[ -z "$tris" ] && { echo "$b: could not read tris"; exit 1; }
pr=$(python3 -c "print(round(min(1,15000/$tris),5))"); wr=$(python3 -c "print(round(min(1,150000/$tris),5))")
$G optimize $T/raw-textured.glb $T/play.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify-ratio $pr --simplify-error 0.01 >/dev/null 2>&1 || { echo "$b play FAIL"; exit 1; }
$G optimize $T/raw-textured.glb $T/web.glb --compress draco --texture-compress webp --texture-size 2048 --simplify-ratio $wr --simplify-error 0.0005 >/dev/null 2>&1 || echo "$b web FAIL"
"$PY" "$HERE/ground.py" $T/play.glb $T/play-grounded.glb || exit 1
pt=$($G inspect $T/play.glb --format md 2>/dev/null | grep '| TRIANGLES' | head -1 | awk -F'|' '{gsub(/[ ,]/,"",$6); print $6}')
echo "$b raw_tris=$tris play_tris=$pt grounded=$(stat -f %z $T/play-grounded.glb)B web=$(stat -f %z $T/web.glb)B"
