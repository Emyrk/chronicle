import os
import sys
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib import footprint


def _pyramid(base_half=2.0, base_y=10.0, apex_y=14.0, offset=(5.0, 0.0)):
    """A square-base pyramid, base centred at (offset[0], base_y, offset[1]),
    apex directly above it — a small synthetic mesh with a known footprint
    (the base square) and a known height, at a deliberately off-origin,
    off-zero position so the transform maths has real work to do."""
    ox, oz = offset
    return [
        (ox - base_half, base_y, oz - base_half),
        (ox + base_half, base_y, oz - base_half),
        (ox + base_half, base_y, oz + base_half),
        (ox - base_half, base_y, oz + base_half),
        (ox, apex_y, oz),
    ]


class FootprintTests(unittest.TestCase):
    def test_footprint_finds_base_center_and_diameter(self):
        positions = _pyramid(base_half=2.0, base_y=10.0, apex_y=14.0, offset=(5.0, -3.0))
        fp = footprint.footprint(positions, slice_frac=0.01)

        self.assertAlmostEqual(fp["min_y"], 10.0)
        self.assertAlmostEqual(fp["center_x"], 5.0)
        self.assertAlmostEqual(fp["center_z"], -3.0)
        # base corners are at radius sqrt(2)*2 from the centre
        self.assertAlmostEqual(fp["diameter"], 2 * (2.0 * 2 ** 0.5), places=5)
        self.assertEqual(fp["n_points"], 4)

    def test_footprint_ignores_a_leaning_apex(self):
        """The apex is off-centre (a leaning pose); footprint must still
        report the base's own centre, not a whole-bounding-box centre."""
        positions = [
            (-2.0, 0.0, -2.0), (2.0, 0.0, -2.0), (2.0, 0.0, 2.0), (-2.0, 0.0, 2.0),
            (20.0, 4.0, 20.0),  # apex leaning far off to one side
        ]
        fp = footprint.footprint(positions, slice_frac=0.01)
        self.assertAlmostEqual(fp["center_x"], 0.0)
        self.assertAlmostEqual(fp["center_z"], 0.0)


def _rectangular_base_pyramid(half_x, half_z, base_y=0.0, apex_y=4.0, offset=(0.0, 0.0)):
    """A pyramid whose base is a half_x x half_z rectangle (not a square),
    so x_extent and z_extent differ — like King Taranis's base, which spans
    0.968 (x) by 0.966 (z) rather than a perfect circle/square."""
    ox, oz = offset
    return [
        (ox - half_x, base_y, oz - half_z),
        (ox + half_x, base_y, oz - half_z),
        (ox + half_x, base_y, oz + half_z),
        (ox - half_x, base_y, oz + half_z),
        (ox, apex_y, oz),
    ]


class BaseAxisExtentsTests(unittest.TestCase):
    def test_square_base_extents_equal_and_smaller_than_enclosing_diameter(self):
        positions = _pyramid(base_half=2.0, base_y=10.0, apex_y=14.0, offset=(5.0, -3.0))
        extents = footprint.base_axis_extents(positions, slice_frac=0.01)

        self.assertAlmostEqual(extents["x_extent"], 4.0)
        self.assertAlmostEqual(extents["z_extent"], 4.0)
        self.assertAlmostEqual(extents["base_diameter"], 4.0)
        # the enclosing-circle diameter (corner-to-corner) is larger than
        # the axis-aligned extent for a square base.
        fp = footprint.footprint(positions, slice_frac=0.01)
        self.assertGreater(fp["diameter"], extents["base_diameter"])

    def test_rectangular_base_extents_differ_per_axis(self):
        positions = _rectangular_base_pyramid(half_x=3.0, half_z=2.0, offset=(1.0, 1.0))
        extents = footprint.base_axis_extents(positions, slice_frac=0.01)

        self.assertAlmostEqual(extents["x_extent"], 6.0)
        self.assertAlmostEqual(extents["z_extent"], 4.0)
        self.assertAlmostEqual(extents["base_diameter"], 5.0)

    def test_bands_are_stable_across_slice_thickness_for_a_flat_base(self):
        positions = _rectangular_base_pyramid(half_x=3.0, half_z=2.0)
        bands = footprint.base_axis_extents_bands(positions, bands=(0.01, 0.02, 0.05))

        self.assertEqual(set(bands.keys()), {"0.01", "0.02", "0.05"})
        for band in bands.values():
            self.assertAlmostEqual(band["base_diameter"], 5.0)


class BaseToZeroTransformTests(unittest.TestCase):
    def test_translates_base_to_y_zero_and_centres_xz(self):
        positions = _pyramid(base_half=2.0, base_y=10.0, apex_y=14.0, offset=(5.0, -3.0))
        transform, source_fp = footprint.base_to_zero_transform(positions, slice_frac=0.01)
        transformed = footprint.apply(transform, positions)

        (min_x, min_y, min_z), (max_x, max_y, max_z) = footprint.bounds(transformed)
        self.assertAlmostEqual(min_y, 0.0, places=9)

        base_fp_after = footprint.footprint(transformed, slice_frac=0.01)
        self.assertAlmostEqual(base_fp_after["center_x"], 0.0, places=9)
        self.assertAlmostEqual(base_fp_after["center_z"], 0.0, places=9)
        self.assertAlmostEqual(source_fp["diameter"], 2 * (2.0 * 2 ** 0.5), places=5)

    def test_scales_footprint_diameter_to_one(self):
        positions = _pyramid(base_half=2.0, base_y=10.0, apex_y=14.0, offset=(5.0, -3.0))
        transform, _ = footprint.base_to_zero_transform(positions, slice_frac=0.01)
        transformed = footprint.apply(transform, positions)

        base_fp_after = footprint.footprint(transformed, slice_frac=0.01)
        self.assertAlmostEqual(base_fp_after["diameter"], 1.0, places=9)

    def test_uniform_scale_preserves_proportions(self):
        """Height above the base should scale by the same factor as the
        footprint diameter — a uniform, not per-axis, scale."""
        positions = _pyramid(base_half=2.0, base_y=10.0, apex_y=14.0, offset=(0.0, 0.0))
        transform, source_fp = footprint.base_to_zero_transform(positions, slice_frac=0.01)
        transformed = footprint.apply(transform, positions)

        expected_scale = 1.0 / source_fp["diameter"]
        apex_height_before = 14.0 - 10.0
        apex_y_after = max(p[1] for p in transformed)
        self.assertAlmostEqual(apex_y_after, apex_height_before * expected_scale, places=9)

    def test_degenerate_zero_diameter_footprint_raises(self):
        positions = [(0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (0.0, 5.0, 0.0)]
        with self.assertRaises(ValueError):
            footprint.base_to_zero_transform(positions, slice_frac=0.01)


if __name__ == "__main__":
    unittest.main()
