"""Small shareable previews for a render set, each under a size budget.

  .venv/bin/python -I tools/preview.py <version-dir> [--width 1600] [--max-bytes 1000000]

Writes preview-textured.webp, preview-shaded-water.webp (and preview-dry.webp) next to the
passes, plus previews.json (source pixel hash, width, quality used, bytes, Pillow version).
Additive only: never touches the passes. render_set.py calls this at the end of every set;
run it by hand on an older version folder to add previews there.
"""
import argparse
import hashlib
import json
import os
import sys

import PIL
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("version_dir")
ap.add_argument("--width", type=int, default=1600)
ap.add_argument("--max-bytes", type=int, default=1_000_000)
ap.add_argument("--sources", nargs="*", default=["textured.png", "shaded-water.png", "dry.png"])
a = ap.parse_args()

report = {"pillow": PIL.__version__, "width": a.width, "max_bytes": a.max_bytes, "previews": {}}
for src in a.sources:
    sp = os.path.join(a.version_dir, src)
    if not os.path.exists(sp):
        continue
    im = Image.open(sp).convert("RGBA")
    small = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
    name = "preview-" + os.path.splitext(src)[0] + ".webp"
    dst = os.path.join(a.version_dir, name)
    quality = None
    for q in (92, 88, 84, 80, 75, 70, 60, 50):
        small.save(dst, "WEBP", quality=q, method=6, exact=False)
        if os.path.getsize(dst) <= a.max_bytes:
            quality = q
            break
    size = os.path.getsize(dst)
    report["previews"][name] = {
        "source": src, "source_sha256_pixels": hashlib.sha256(im.tobytes()).hexdigest(),
        "size": [small.width, small.height], "quality": quality, "bytes": size,
        "within_budget": size <= a.max_bytes,
    }
    print("  %-28s %dx%d q=%s %.0f KB%s" % (name, small.width, small.height, quality, size / 1024,
                                             "" if size <= a.max_bytes else "  OVER BUDGET"), file=sys.stderr)
json.dump(report, open(os.path.join(a.version_dir, "previews.json"), "w"), indent=2)
