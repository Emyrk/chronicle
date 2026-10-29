import math
import os
import sys
import unittest
from collections import defaultdict

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib import normals


def _welded_cylinder(n_seg=12, radius=1.0, y0=0.0, y1=2.0):
    """A minimal *welded* (smooth-vertex) cylinder: a flat top cap plus an
    open-bottom side wall, sharing the top rim's vertices between the cap
    triangles and the wall triangles — the "before" state a crease-split is
    meant to fix (unlike `build_candidates.build_cylinder`'s already-split
    primitive, built deliberately with separate rings so it never needs
    one)."""
    positions = []
    top_center = len(positions)
    positions.append((0.0, y1, 0.0))
    top_ring = len(positions)
    for i in range(n_seg):
        a = 2 * math.pi * i / n_seg
        positions.append((radius * math.cos(a), y1, radius * math.sin(a)))
    bottom_ring = len(positions)
    for i in range(n_seg):
        a = 2 * math.pi * i / n_seg
        positions.append((radius * math.cos(a), y0, radius * math.sin(a)))

    indices = []
    for i in range(n_seg):
        j = (i + 1) % n_seg
        indices += [top_center, top_ring + j, top_ring + i]  # normal +Y
    for i in range(n_seg):
        j = (i + 1) % n_seg
        t0, t1, b0, b1 = top_ring + i, top_ring + j, bottom_ring + i, bottom_ring + j
        indices += [t0, b1, b0]  # both wall triangles wind to an outward,
        indices += [t0, t1, b1]  # horizontal (y=0) normal
    return positions, indices, top_ring, bottom_ring


def _uv_sphere(radius=1.0, n_lat=16, n_lon=16):
    """A closed, welded UV sphere, fine enough that every pair of adjacent
    face normals is well under 45deg apart — nothing here should ever
    trigger a crease."""
    positions = []
    for i in range(n_lat + 1):
        theta = math.pi * i / n_lat
        y = radius * math.cos(theta)
        r = radius * math.sin(theta)
        for j in range(n_lon):
            phi = 2 * math.pi * j / n_lon
            positions.append((r * math.cos(phi), y, r * math.sin(phi)))

    def idx(i, j):
        return i * n_lon + (j % n_lon)

    indices = []
    for i in range(n_lat):
        for j in range(n_lon):
            a, b, c, d = idx(i, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j + 1)
            indices += [a, b, c]
            indices += [b, d, c]
    return positions, indices


def _group_new_ids_by_position(positions):
    by_pos = defaultdict(list)
    for nid, p in enumerate(positions):
        by_pos[p].append(nid)
    return by_pos


class CreasedNormalsCylinderTests(unittest.TestCase):
    def setUp(self):
        self.n_seg = 12
        self.positions, self.indices, self.top_ring, self.bottom_ring = _welded_cylinder(
            n_seg=self.n_seg,
        )
        self.new_positions, self.new_normals, self.new_indices = normals.creased_normals(
            self.positions, self.indices, 45,
        )
        self.by_pos = _group_new_ids_by_position(self.new_positions)

    def test_triangle_and_index_count_are_unchanged(self):
        self.assertEqual(len(self.new_indices), len(self.indices))
        self.assertEqual(len(self.new_indices) % 3, 0)

    def test_top_rim_vertices_split_into_a_cap_normal_and_a_wall_normal(self):
        for i in range(self.n_seg):
            orig = self.positions[self.top_ring + i]
            new_ids = self.by_pos[orig]
            self.assertEqual(len(new_ids), 2, f"top rim vertex {i} should split into 2")
            got_normals = sorted((self.new_normals[nid] for nid in new_ids))
            cap_normals = [n for n in got_normals if n[1] > 0.99]
            wall_normals = [n for n in got_normals if abs(n[1]) < 1e-6]
            self.assertEqual(len(cap_normals), 1)
            self.assertEqual(cap_normals[0], (0.0, 1.0, 0.0))
            self.assertEqual(len(wall_normals), 1)

    def test_bottom_rim_vertices_stay_a_single_smooth_wall_vertex(self):
        for i in range(self.n_seg):
            orig = self.positions[self.bottom_ring + i]
            new_ids = self.by_pos[orig]
            self.assertEqual(len(new_ids), 1, f"bottom rim vertex {i} should not split")
            self.assertAlmostEqual(self.new_normals[new_ids[0]][1], 0.0, places=6)

    def test_wall_normals_point_radially_outward_and_horizontal(self):
        for i in range(self.n_seg):
            orig = self.positions[self.bottom_ring + i]
            nid = self.by_pos[orig][0]
            nx, ny, nz = self.new_normals[nid]
            self.assertAlmostEqual(ny, 0.0, places=6)
            # radially outward: normal points the same way as the vertex's
            # own (x, z) position (both are unit-length in the xz-plane).
            px, _, pz = orig
            self.assertGreater(nx * px + nz * pz, 0.0)


class CreasedNormalsSphereTests(unittest.TestCase):
    def test_smooth_sphere_has_no_splits_under_45deg(self):
        positions, indices = _uv_sphere(n_lat=16, n_lon=16)
        new_positions, new_normals, new_indices = normals.creased_normals(positions, indices, 45)

        self.assertEqual(len(new_positions), len(positions))
        self.assertEqual(len(new_indices), len(indices))

    def test_smooth_sphere_normals_point_radially_outward(self):
        positions, indices = _uv_sphere(radius=1.0, n_lat=16, n_lon=16)
        _, new_normals, _ = normals.creased_normals(positions, indices, 45)

        for p, n in zip(positions, new_normals):
            # every vertex on a unit sphere centred at the origin is its
            # own outward normal; a smooth, uncreased recompute should land
            # close to it (low-poly faceting keeps this approximate).
            dot = p[0] * n[0] + p[1] * n[1] + p[2] * n[2]
            self.assertGreater(dot, 0.9)


class VectorHelperTests(unittest.TestCase):
    def test_angle_between_deg_of_perpendicular_vectors(self):
        self.assertAlmostEqual(normals.angle_between_deg((1.0, 0.0, 0.0), (0.0, 1.0, 0.0)), 90.0)

    def test_angle_between_deg_of_parallel_vectors_is_zero(self):
        self.assertAlmostEqual(normals.angle_between_deg((1.0, 0.0, 0.0), (2.0, 0.0, 0.0)), 0.0)

    def test_face_normal_of_xy_triangle_points_plus_z(self):
        n = normals.face_normal((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0))
        self.assertEqual(n, (0.0, 0.0, 1.0))


if __name__ == "__main__":
    unittest.main()
