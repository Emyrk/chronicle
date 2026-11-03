"""Fit Internet Historian's map (pixels on his 1920x1080 frame) to world X/Y on
map 229, from the Rookery's pillars, and report the leftover error in yards.

    python3 -I scripts/leeroy/fit-ih-map.py > scripts/leeroy/ih-map-fit.json

His map is drawn with north at the bottom and east on the left (a 180 degree
turn from north-up); its door notch at the bottom is the Rookery's west door
to the Hall of Binding. Pillar centres:
  - his: the grey rectangles, measured on his frame (constant through the video);
  - real: the standing pillars on the published map 229 render
    (render-pillars.py: solid black squares; the mesh agrees within 0.3 yd).
His drawing has 3 pillars in the top row and 4 in the bottom. The Rookery has
only four pillars standing to full height: two in the north row (x ~94: y
-322.6 and -249.3) and two in the south row (x ~62: y -322.6 and -296.7). The
rest are broken stumps and rubble. The four standing ones are matched to his outer and inner rectangles;
his other three are left out of the fit and their predicted spots reported.
Needs numpy.
"""
import json

import numpy as np

# Pixel centres on his map: (column, row).
HIS = {
    "top-1": (374.0, 231.5), "top-2": (769.0, 231.5), "top-3": (1162.0, 231.5),
    "bottom-1": (374.0, 705.0), "bottom-2": (768.5, 706.0), "bottom-3": (1161.0, 707.0), "bottom-4": (1631.0, 707.0),
}
# World centres (x, y) of the four standing pillars, from render-pillars.py on
# the published render (229-afeacc4376ed7847-...-v002-shaded-water-2400.png).
REAL = {
    "bottom-1": (93.97, -322.64), "bottom-4": (94.20, -249.29),
    "top-1": (62.12, -322.56), "top-2": (62.09, -296.65),
}


def main():
    names = sorted(REAL)
    src = np.array([[*HIS[n], 1.0] for n in names])
    dst = np.array([REAL[n] for n in names])
    # world = [px, py, 1] @ A  (affine: his drawing is not to scale on both axes)
    A, *_ = np.linalg.lstsq(src, dst, rcond=None)
    fitted = src @ A
    errors = np.linalg.norm(fitted - dst, axis=1)
    unmatched = {n: [round(float(v), 2) for v in np.array([*HIS[n], 1.0]) @ A] for n in HIS if n not in REAL}
    # Yards per pixel along his two axes.
    scale = np.linalg.norm(A[:2], axis=1)
    json.dump({
        "about": "world [x, y] = [px, py, 1] @ affine, px/py on Internet Historian's 1920x1080 map frame",
        "affine": [[round(float(v), 6) for v in row] for row in A],
        "yardsPerPixel": {"column": round(float(scale[0]), 4), "row": round(float(scale[1]), 4)},
        "pillars": {n: {"his": HIS[n], "real": REAL[n], "fitted": [round(float(v), 2) for v in f], "errorYards": round(float(e), 2)}
                    for n, f, e in zip(names, fitted, errors)},
        "rmsErrorYards": round(float(np.sqrt((errors ** 2).mean())), 2),
        "maxErrorYards": round(float(errors.max()), 2),
        "unmatchedPredicted": unmatched,
    }, __import__("sys").stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
