"""Find the Rookery's standing pillars on the published map 229 render: they are
drawn as solid black squares (taller than the render's height range).

    curl -o r229.png https://icons.chronicleclassic.com/turtle/maps/renders/229-afeacc4376ed7847-229-blackrock-spire-floor-1-v002-shaded-water-2400.png
    python3 -I scripts/leeroy/render-pillars.py r229.png

Prints each square's world centre (x, y) and size in yards, from the render's
manifest bounds (width spans world Y from maxY, height spans world X from
maxX). fit-ih-map.py uses these centres. Needs numpy + opencv-python-headless.
"""
import sys

import cv2
import numpy as np

BOUNDS = {"minX": -226.8007, "maxX": 334.37, "minY": -591.5577, "maxY": 125.8927}
ROOKERY = {"minX": 46.0, "maxX": 110.0, "minY": -341.0, "maxY": -233.0}


def main():
    image = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
    height, width = image.shape[:2]
    span_y = BOUNDS["maxY"] - BOUNDS["minY"]
    span_x = BOUNDS["maxX"] - BOUNDS["minX"]
    to_world = lambda u, v: (BOUNDS["maxX"] - v / height * span_x, BOUNDS["maxY"] - u / width * span_y)
    col = lambda y: int((BOUNDS["maxY"] - y) / span_y * width)
    row = lambda x: int((BOUNDS["maxX"] - x) / span_x * height)
    u0, u1 = col(ROOKERY["maxY"]), col(ROOKERY["minY"])
    v0, v1 = row(ROOKERY["maxX"]), row(ROOKERY["minX"])
    crop = image[v0:v1, u0:u1, :3]
    alpha = image[v0:v1, u0:u1, 3] if image.shape[2] == 4 else np.full(crop.shape[:2], 255, np.uint8)
    dark = ((crop.max(axis=2) < 30) & (alpha > 200)).astype(np.uint8)
    count, _, stats, centres = cv2.connectedComponentsWithStats(dark, connectivity=4)
    yd_per_px = span_y / width
    for k in range(1, count):
        w, h, area = stats[k, cv2.CC_STAT_WIDTH], stats[k, cv2.CC_STAT_HEIGHT], stats[k, cv2.CC_STAT_AREA]
        # A standing pillar: a filled square of 5-6 yards; the north ones carry
        # a short shadow strip on their south side (up to 8 yards tall).
        if not (4.5 <= w * yd_per_px <= 8 and 4.5 <= h * yd_per_px <= 8 and area >= 0.75 * w * h):
            continue
        cu, cv = centres[k]
        x, y = to_world(u0 + cu, v0 + cv)
        print(f"pillar x {x:7.2f} y {y:8.2f}  size {w * yd_per_px:.1f} x {h * yd_per_px:.1f} yd")


if __name__ == "__main__":
    main()
