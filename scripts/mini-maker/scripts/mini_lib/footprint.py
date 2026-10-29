"""Play-tier transform maths: base-to-zero translate + footprint-normalised
uniform scale.

Pure functions over plain (x, y, z) tuples, no I/O — so the maths can be
unit-tested on a small synthetic mesh without a real .glb on disk. Stage D
calls these, then `glbtools.rewrite_positions` applies the resulting
transform to an actual mesh.

The "footprint" is the bottom slice of the mesh (vertices within
`slice_frac` of the mesh's height above its lowest point) — not the whole
bounding box, since a leaning pose would otherwise skew the x/z centre away
from where the model actually stands.
"""
from __future__ import annotations

DEFAULT_SLICE_FRAC = 0.01


def _base_slice(positions, slice_frac):
    """The (x, z) points of `positions` within `slice_frac` of the mesh's
    height above its lowest point — the bottom slice shared by `footprint()`
    and `base_axis_extents()`. Returns (slice_pts, min_y)."""
    if not positions:
        raise ValueError("no positions")
    ys = [p[1] for p in positions]
    min_y = min(ys)
    height = max(ys) - min_y
    eps = slice_frac * height if height > 0 else 0.0
    slice_pts = [(p[0], p[2]) for p in positions if p[1] - min_y <= eps]
    if not slice_pts:
        slice_pts = [(p[0], p[2]) for p in positions if p[1] == min_y]
    return slice_pts, min_y


def footprint(positions, slice_frac=DEFAULT_SLICE_FRAC):
    """The base footprint of `positions` (a list of (x, y, z) tuples).

    Returns a dict: min_y, center_x, center_z, diameter, n_points,
    slice_frac. `diameter` is 2x the farthest slice point from the slice
    centroid (an enclosing-circle approximation) — the base plate on a
    tabletop mini is round, so this tracks its true diameter closer than an
    axis-aligned bounding box would for a base that isn't perfectly
    axis-aligned.
    """
    slice_pts, min_y = _base_slice(positions, slice_frac)
    n = len(slice_pts)
    center_x = sum(p[0] for p in slice_pts) / n
    center_z = sum(p[1] for p in slice_pts) / n
    max_r = max(((x - center_x) ** 2 + (z - center_z) ** 2) ** 0.5 for x, z in slice_pts)
    diameter = 2 * max_r
    return {
        "min_y": min_y,
        "center_x": center_x,
        "center_z": center_z,
        "diameter": diameter,
        "n_points": n,
        "slice_frac": slice_frac,
    }


def base_axis_extents(positions, slice_frac=DEFAULT_SLICE_FRAC):
    """The base slice's axis-aligned x/z extent (mini-003) — as opposed to
    `footprint()`'s enclosing-circle `diameter`. King Taranis's base isn't a
    perfect circle, so a tabletop renderer needs the actual x/z span it draws,
    not the (larger) circle that encloses every base point.

    Returns a dict: x_extent, z_extent, base_diameter (their mean — what
    `stage_d.play(_15k).base_diameter` records), n_points, slice_frac.
    """
    slice_pts, _ = _base_slice(positions, slice_frac)
    xs = [p[0] for p in slice_pts]
    zs = [p[1] for p in slice_pts]
    x_extent = max(xs) - min(xs)
    z_extent = max(zs) - min(zs)
    return {
        "x_extent": x_extent,
        "z_extent": z_extent,
        "base_diameter": (x_extent + z_extent) / 2,
        "n_points": len(slice_pts),
        "slice_frac": slice_frac,
    }


def base_axis_extents_bands(positions, bands=(0.01, 0.02, 0.05)):
    """`base_axis_extents()` at each of `bands`, keyed by slice_frac formatted
    as "%.2f" — lets Stage D record how the measurement moves (or doesn't)
    with the slice thickness, so the 1% default is visible as a choice
    rather than an unexamined constant (mini-003)."""
    return {f"{b:.2f}": base_axis_extents(positions, b) for b in bands}


def base_to_zero_transform(positions, slice_frac=DEFAULT_SLICE_FRAC):
    """Compute the transform that puts `positions`' base at y=0, centres the
    footprint on x/z, and scales so the footprint diameter is 1.0.

    Returns (transform_fn, footprint_dict) — `transform_fn(x, y, z)` returns
    the transformed (x, y, z); `footprint_dict` is the pre-transform
    `footprint()` result (the "source footprint" Stage D records).
    """
    fp = footprint(positions, slice_frac)
    if fp["diameter"] <= 0:
        raise ValueError("degenerate footprint: diameter is zero")
    scale = 1.0 / fp["diameter"]
    cx, cz, min_y = fp["center_x"], fp["center_z"], fp["min_y"]

    def transform(x, y, z):
        return ((x - cx) * scale, (y - min_y) * scale, (z - cz) * scale)

    return transform, fp


def apply(transform, positions):
    return [transform(*p) for p in positions]


def bounds(positions):
    """Axis-aligned (min, max) tuples over `positions`, for meta.json's
    "bounds after" record."""
    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    zs = [p[2] for p in positions]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))
