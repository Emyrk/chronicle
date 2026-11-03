"""Coarse walkable-floor heights for the Rookery and the hall behind its west
door, from a local export of the map 229 mesh (Wavefront OBJ in the render
pipeline's frame: vertex = (-wow_x, -wow_y, wow_z)).

    python3 -I scripts/leeroy/floor-heights.py <blackrock-spire.obj> > scripts/leeroy/rookery-floor.json

Internet Historian's map is flat; this gives each tracked position a height:
the highest up-facing surface between z 88 and 103.5 per 2-yard cell (the
floor at 91.5 and the rubble in the west, below the north terrace at 106.4
and the pillar tops). Cells with no such surface are null. Only these derived
numbers are committed, never the mesh. Needs numpy.
"""
import json
import sys

import numpy as np

STEP = 2.0
X0, X1, Y0, Y1 = 44.0, 136.0, -346.0, -228.0
ZMIN, ZMAX = 88.0, 103.5


def main():
    vertices, faces = [], []
    with open(sys.argv[1]) as obj:
        for line in obj:
            if line.startswith("v "):
                vertices.append([float(v) for v in line.split()[1:4]])
            elif line.startswith("f "):
                faces.append([int(v.split("/")[0]) - 1 for v in line.split()[1:4]])
    v = np.array(vertices)
    world = np.stack([-v[:, 0], -v[:, 1], v[:, 2]], axis=1)
    tris = world[np.array(faces)]
    near = ((tris[:, :, 0].max(1) >= X0) & (tris[:, :, 0].min(1) <= X1) & (tris[:, :, 1].max(1) >= Y0)
            & (tris[:, :, 1].min(1) <= Y1) & (tris[:, :, 2].max(1) >= ZMIN) & (tris[:, :, 2].min(1) <= ZMAX))
    tris = tris[near]
    normal = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    # Up-facing only: the export's frame is a 180-degree turn about z, so the
    # winding (and which side faces up) is kept. This drops the terrace's underside.
    tris = tris[normal[:, 2] / np.linalg.norm(normal, axis=1).clip(1e-9) > 0.5]
    xs = np.arange(X0, X1 + 1e-6, STEP)
    ys = np.arange(Y0, Y1 + 1e-6, STEP)
    height = np.full((len(xs), len(ys)), np.nan)
    for a, b, c in tris:
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9:
            continue
        ii = np.nonzero((xs >= min(a[0], b[0], c[0])) & (xs <= max(a[0], b[0], c[0])))[0]
        jj = np.nonzero((ys >= min(a[1], b[1], c[1])) & (ys <= max(a[1], b[1], c[1])))[0]
        for i in ii:
            for j in jj:
                x, y = xs[i], ys[j]
                l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d
                l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d
                l3 = 1 - l1 - l2
                if min(l1, l2, l3) < -1e-6:
                    continue
                z = l1 * a[2] + l2 * b[2] + l3 * c[2]
                if ZMIN <= z <= ZMAX and not (height[i, j] >= z):
                    height[i, j] = z
    json.dump({
        "about": "walkable floor z on a 2-yard grid, from the map 229 mesh (orchestrator render); heights[i][j] at x = x0 + i*step, y = y0 + j*step",
        "x0": X0, "y0": Y0, "step": STEP,
        "heights": [[None if np.isnan(z) else round(float(z), 1) for z in row] for row in height],
    }, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
