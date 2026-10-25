"""Register a Blender top-down render onto inputs/wc-real.png's pixel frame.

  python3 -I align_to_real.py --src inputs/wc-textured.png --real inputs/wc-real.png \
      --out inputs/wc-textured-aligned.png [--bg 12,17,20] [--also inputs/wc-water.png ...]

Both images come from the same geometry and the same projection (WoW -Y right, -X down), so
the map between them is a pure scale + translation.  Fit: scale from the floor-mask area ratio,
translation from centroids, then a local grid search maximising IoU.  Writes the aligned image
at wc-real.png's size, composited onto --bg (the pipeline's flat background colour), and an
align.json with the src-px -> real-px matrix and the IoU achieved.  --also applies the same
transform to extra passes (water mask, shaded) so they stay registered.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--src", required=True)
ap.add_argument("--real", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--bg", default="12,17,20")
ap.add_argument("--bg-threshold", type=int, default=30)
ap.add_argument("--also", nargs="*", default=[])
a = ap.parse_args()

src_full = Image.open(a.src).convert("RGBA")
real = Image.open(a.real).convert("RGB")
# A big render (4x+) must be box-filtered down before the affine resample, or the 1-bit mask
# aliases and the fit degrades. Reduce by an integer factor so src is at most 2x the reference.
reduce_f = max(1, int(src_full.width / (2 * real.width)))
src = src_full.reduce(reduce_f) if reduce_f > 1 else src_full
bg = np.array([int(c) for c in a.bg.split(",")])
real_mask = np.abs(np.asarray(real).astype(int) - bg).sum(2) > a.bg_threshold
src_mask = np.asarray(src.getchannel("A")) > 0
RW, RH = real.size


def warp_mask(scale, tx, ty, size=(RW, RH)):
    # dst(x,y) = src((x - tx)/scale, (y - ty)/scale)
    m = Image.fromarray(src_mask.astype(np.uint8) * 255)
    inv = (1 / scale, 0, -tx / scale, 0, 1 / scale, -ty / scale)
    return np.asarray(m.transform(size, Image.AFFINE, inv, Image.BILINEAR)) > 127


def iou(scale, tx, ty):
    w = warp_mask(scale, tx, ty)
    return (w & real_mask).sum() / max(1, (w | real_mask).sum())


# initial guess
ys, xs = np.nonzero(src_mask)
yr, xr = np.nonzero(real_mask)
scale = np.sqrt(real_mask.sum() / src_mask.sum())
tx = xr.mean() - xs.mean() * scale
ty = yr.mean() - ys.mean() * scale
best = (iou(scale, tx, ty), scale, tx, ty)
for step_s, step_t in [(0.01, 4), (0.003, 1.5), (0.001, 0.5), (0.0003, 0.2)]:
    improved = True
    while improved:
        improved = False
        _, s0, x0, y0 = best
        for ds in (-step_s, 0, step_s):
            for dx in (-step_t, 0, step_t):
                for dy in (-step_t, 0, step_t):
                    if ds == dx == dy == 0:
                        continue
                    v = iou(s0 + ds, x0 + dx, y0 + dy)
                    if v > best[0]:
                        best = (v, s0 + ds, x0 + dx, y0 + dy)
                        improved = True
score, scale, tx, ty = best
print("fit: scale %.5f (x1/%d pre-reduce)  tx %.2f  ty %.2f  IoU %.4f" % (scale, reduce_f, tx, ty, score))


def warp_rgba(im):
    im = im.convert("RGBA")
    if reduce_f > 1:
        im = im.reduce(reduce_f)
    inv = (1 / scale, 0, -tx / scale, 0, 1 / scale, -ty / scale)
    return im.transform((RW, RH), Image.AFFINE, inv, Image.BICUBIC)


def save_on_bg(im, path):
    base = Image.new("RGBA", (RW, RH), tuple(int(c) for c in bg) + (255,))
    base.alpha_composite(im)
    base.convert("RGB").save(path)


aligned = warp_rgba(src_full)  # warp_rgba reduces itself; src is already reduced
save_on_bg(aligned, a.out)
aligned.save(os.path.splitext(a.out)[0] + "-rgba.png")
for extra in a.also:
    e = warp_rgba(Image.open(extra))
    dst = os.path.splitext(extra)[0] + "-aligned.png"
    e.save(dst)
    print("wrote", dst)
full_scale = scale / reduce_f  # matrix for the ORIGINAL src pixels
json.dump({"src": a.src, "real": a.real, "reduce_factor": reduce_f,
           "matrix": [[full_scale, 0, tx], [0, full_scale, ty], [0, 0, 1]],
           "description": "SRC px -> REAL px (wc-real.png frame). out = M @ [x, y, 1]",
           "iou": score, "size": [RW, RH]}, open(os.path.splitext(a.out)[0] + ".json", "w"), indent=2)
print("wrote", a.out)
