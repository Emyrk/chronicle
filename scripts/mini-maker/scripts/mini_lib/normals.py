"""Crease-split vertex normals — mini-005.

mini-004 (`probes/2026-09-28-mesh-quality/`) measured that King Taranis's
base renders as a star of long, thin triangles because smooth per-vertex
normals are interpolated across sliver triangles that fan out from the
base's centre, and that the mesh's stored normals are also stale from the
raw Meshy output. Splitting the normal at every vertex where two incident
faces disagree by more than `threshold_deg` — rather than blending across
every triangle that happens to share a vertex — turns each roughly-flat
region back into a flat-looking facet without changing the mesh's topology
(face/index count), fixing the star. The operator picked the 45deg threshold
(`C2-45-budget`) by eye, live on the tabletop, on 2026-09-28.

Ported from `probes/2026-09-28-mesh-quality/meshtools.py`'s
`creased_normals` (that probe's `C2` candidate family). Stdlib-only, like
the rest of Stage D.
"""
from __future__ import annotations

import math


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def length(a):
    return math.sqrt(dot(a, a))


def normalize(a):
    n = length(a)
    if n == 0:
        return (0.0, 0.0, 0.0)
    return (a[0] / n, a[1] / n, a[2] / n)


def face_normal(v0, v1, v2):
    return normalize(cross(sub(v1, v0), sub(v2, v0)))


def angle_between_deg(a, b):
    """Angle in degrees between two vectors (need not be unit)."""
    la, lb = length(a), length(b)
    if la == 0 or lb == 0:
        return 0.0
    c = max(-1.0, min(1.0, dot(a, b) / (la * lb)))
    return math.degrees(math.acos(c))


def face_normals_of(positions, indices):
    n_tris = len(indices) // 3
    return [
        face_normal(positions[indices[t * 3]], positions[indices[t * 3 + 1]], positions[indices[t * 3 + 2]])
        for t in range(n_tris)
    ]


def _vertex_incident_triangles(indices, n_verts):
    incident = [[] for _ in range(n_verts)]
    n_tris = len(indices) // 3
    for t in range(n_tris):
        for slot in range(3):
            incident[indices[t * 3 + slot]].append(t)
    return incident


def creased_normals(positions, indices, threshold_deg):
    """Unweld + face normals + weld-by-angle, done as one pass rather than
    three separate CLI calls. For every original (welded) vertex, its
    incident faces are greedily clustered so any two faces in the same
    cluster are within `threshold_deg` of that cluster's running average
    face normal (a from-scratch angle-threshold clustering — not three.js's
    edge-adjacency `toCreasedNormals`, but the same idea). Each cluster
    becomes its own vertex (position duplicated, one new normal); a vertex
    with a single cluster (no crease) is left as one vertex — unlike a full
    unweld, this only grows the vertex count where a real crease exists.

    Returns (new_positions, new_normals, new_indices). Triangle count (and
    so `len(new_indices)`) is unchanged; only vertex count can grow.
    """
    face_normals = face_normals_of(positions, indices)
    n_tris = len(indices) // 3
    incident = _vertex_incident_triangles(indices, len(positions))

    new_positions, new_normals = [], []
    corner_vertex = {}  # (tri, slot) -> new vertex id

    for vid, tris in enumerate(incident):
        if not tris:
            continue
        remaining = list(tris)
        groups = []
        while remaining:
            seed = remaining.pop(0)
            group = [seed]
            group_normal = face_normals[seed]
            i = 0
            while i < len(remaining):
                t = remaining[i]
                if angle_between_deg(face_normals[t], group_normal) < threshold_deg:
                    group.append(t)
                    remaining.pop(i)
                    acc = [0.0, 0.0, 0.0]
                    for member in group:
                        fn = face_normals[member]
                        acc[0] += fn[0]; acc[1] += fn[1]; acc[2] += fn[2]
                    group_normal = normalize(tuple(acc))
                    i = 0
                else:
                    i += 1
            groups.append((group, group_normal))

        for group, group_normal in groups:
            new_vid = len(new_positions)
            new_positions.append(positions[vid])
            new_normals.append(group_normal)
            for t in group:
                for slot in range(3):
                    if indices[t * 3 + slot] == vid:
                        corner_vertex[(t, slot)] = new_vid

    new_indices = [0] * (n_tris * 3)
    for t in range(n_tris):
        for slot in range(3):
            new_indices[t * 3 + slot] = corner_vertex[(t, slot)]
    return new_positions, new_normals, new_indices
