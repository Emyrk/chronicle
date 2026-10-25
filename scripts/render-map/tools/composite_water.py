"""Composite the water mask over the dry albedo render with smoothed tile edges.

  python3 -I composite_water.py --dry inputs/wc-textured-dry.png --water inputs/wc-water.png \
      (wc-water.png from blender_topdown.py --water-mask, so bridges above water stay dry) \
      --out inputs/wc-textured.png [--tint 0.55] [--smooth 6]

Water pixels = dry floor blended toward a lake blue (tint), darkened slightly toward the pool
centre, plus a thin darker shoreline.  The MLIQ grid is 4.17 world units per tile, so the raw
mask is blocky; --smooth blurs and re-thresholds it to round the tile corners.
"""
import argparse

from PIL import Image, ImageChops, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("--dry", required=True)
ap.add_argument("--water", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--tint", type=float, default=0.42, help="0 = floor texture, 1 = flat blue")
ap.add_argument("--smooth", type=float, default=6.0, help="blur radius (px) before re-threshold")
ap.add_argument("--color", default="78,150,196", help="water RGB")
ap.add_argument("--px-scale", type=float, default=1.0,
                help="radii below were tuned at 2400 px width; pass width/2400 for other sizes")
a = ap.parse_args()
k = a.px_scale
odd = lambda v: max(3, int(round(v)) | 1)

dry = Image.open(a.dry).convert("RGBA")
water = Image.open(a.water).convert("RGBA")
if water.size != dry.size:
    raise SystemExit("size mismatch %s vs %s: render both passes with the same camera" % (water.size, dry.size))
r, g, b, wa = water.split()
# --water-mask pass: water is blue over WHITE floors -> mask = blue. --liquid-only pass (no white
# floors at all): alpha is the mask. Never fall back to alpha when floors are present, or a map
# with no visible water gets tinted everywhere (an early Excavation Site render).
blue = Image.eval(ImageChops.subtract(b, r), lambda v: 255 if v > 25 else 0)
has_floor = ImageChops.multiply(Image.eval(r, lambda v: 255 if v > 200 else 0), wa).getbbox() is not None
mask = blue if (blue.getbbox() or has_floor) else wa
if not blue.getbbox():
    print("note: no water pixels in the water pass", file=__import__("sys").stderr)
if a.smooth > 0:
    mask = mask.filter(ImageFilter.GaussianBlur(a.smooth * k)).point(lambda v: 255 if v >= 128 else 0)
# only where there is floor under it (water hanging in void is a render artefact)
mask = ImageChops.multiply(mask, dry.getchannel("A"))
soft = mask.filter(ImageFilter.GaussianBlur(1.0 * k))  # anti-aliased edge

blue = Image.new("RGBA", dry.size, tuple(int(c) for c in a.color.split(",")) + (255,))
tinted = Image.blend(dry, blue, a.tint)
# deeper = darker: distance from shore approximated by a wider blur of the mask
depth = mask.filter(ImageFilter.GaussianBlur(14 * k)).point(lambda v: int(v * 0.16))
tinted = ImageChops.subtract(tinted, Image.merge("RGBA", [depth, depth, depth, Image.new("L", dry.size, 0)]))
# shoreline: ring just outside the water
ring = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(odd(5 * k))), mask).point(lambda v: int(v * 0.18))
out = Image.composite(tinted, dry, soft)
out = ImageChops.subtract(out, Image.merge("RGBA", [ring, ring, ring, Image.new("L", dry.size, 0)]))
out.putalpha(dry.getchannel("A"))
out.save(a.out)
print("wrote", a.out, "water px: %d" % (mask.histogram()[255]))
