#!/bin/bash
# usage: D=<dungeon> sheet.sh out.jpg slug:refimage ...   (rows of ref / front / back; runs inside the configured workdir, so out.jpg is relative to it)
HERE=$(cd "$(dirname "$0")" && pwd); PY=${PY:-python3.12}
cd "$($PY "$HERE/../../../../scripts/mini-maker/scripts/mini_lib/config.py" --workdir)" || exit 1
out=$1; shift; F=/System/Library/Fonts/Helvetica.ttc; rows=()
for p in "$@"; do s=${p%%:*}; r=${p#*:}; t=$(mktemp -d)
  magick montage -font $F -pointsize 22 -geometry 480x480+6+6 -tile 3x1 -background '#f4f1ea' \
    -label "$s — ref" dungeons/$D/refs/$r -label front work/$D/$s/front.png -label back work/$D/$s/back.png $t/row.jpg
  rows+=($t/row.jpg); done
magick "${rows[@]}" -append -quality 85 $out
