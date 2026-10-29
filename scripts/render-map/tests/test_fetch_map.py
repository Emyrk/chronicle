import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import fetch_map  # noqa: E402


def chunk(tag, payload):
    return tag[::-1].encode("ascii") + struct.pack("<I", len(payload)) + payload


class LegacyTerrainDispatchTest(unittest.TestCase):
    def test_wdt_tiles_and_mpq_dispatch_detect_terrain(self):
        main = bytearray(64 * 64 * 8)
        for x, y in ((31, 30), (32, 30), (31, 31), (32, 31)):
            struct.pack_into("<I", main, 8 * (y * 64 + x), 1)
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "map.wdt"
            path.write_bytes(chunk("MPHD", struct.pack("<I", 7)) + chunk("MAIN", main))
            self.assertEqual([(t["x"], t["y"]) for t in fetch_map.wdt_tiles(path)],
                             [(31, 30), (32, 30), (31, 31), (32, 31)])
            self.assertEqual(fetch_map.mpq_world_kind(path, {}), "terrain")
            self.assertEqual(fetch_map.wdt_mphd_flags(path), 7)

    def test_placed_wmo_keeps_wmo_dispatch(self):
        main = bytearray(64 * 64 * 8)
        struct.pack_into("<I", main, 8 * (30 * 64 + 31), 1)
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "map.wdt"
            path.write_bytes(chunk("MAIN", main))
            self.assertEqual(fetch_map.mpq_world_kind(path, {"placed_wmo": "x.wmo"}), "wmo")

    def test_legacy_minimap_name(self):
        self.assertEqual(fetch_map.legacy_minimap_name("EmeraldSanctum", 31, 30),
                         "World\\Minimaps\\EmeraldSanctum\\map31_30.blp")


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
