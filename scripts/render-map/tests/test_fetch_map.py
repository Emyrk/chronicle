import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import fetch_map  # noqa: E402


class PlacementBoundsTest(unittest.TestCase):
    def test_accepts_verified_placement_bounds(self):
        self.assertTrue(fetch_map.validate_placement_extent(0.25, {"uniqueID": 7}, False))

    def test_rejects_stale_placement_bounds_by_default(self):
        placement = {"uniqueID": 7}
        with self.assertRaisesRegex(SystemExit, "does not reproduce its MODF extents"):
            fetch_map.validate_placement_extent(1467.3, placement, False)

    def test_explicit_opt_in_allows_and_marks_stale_bounds(self):
        placement = {"uniqueID": 7}
        self.assertFalse(fetch_map.validate_placement_extent(1467.3, placement, True))


if __name__ == "__main__":
    unittest.main()
