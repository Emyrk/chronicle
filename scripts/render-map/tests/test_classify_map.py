import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import classify_map as cm  # noqa: E402
import fetch_map  # noqa: E402


def groups(n_small, small_diag=50.0, small_area=100.0, big_diag=None, big_area=None):
    gs = [{"gi": i, "diag": small_diag, "area": small_area} for i in range(n_small)]
    if big_diag:
        gs.append({"gi": n_small, "diag": big_diag, "area": big_area})
    return gs


class BackdropTest(unittest.TestCase):
    def test_flags_oversized_group_with_more_area_than_all_others(self):
        # Deadmines g045 shape: ~28x the median diagonal, ~6x the area of the other groups together
        found = cm.find_backdrops(groups(45, 54.0, 4333.0, 1534.0, 1188010.0))
        self.assertEqual([b["gi"] for b in found], [45])
        self.assertGreater(found[0]["diag_x_median"], 28)
        self.assertGreater(found[0]["area_x_others"], 6)

    def test_big_but_thin_group_is_not_a_backdrop(self):
        # Lordaeron's Undercity: 12x the median diagonal but 0.06x the others' area
        self.assertEqual(cm.find_backdrops(groups(40, 29.0, 10000.0, 372.0, 70244.0)), [])

    def test_large_area_with_ordinary_diagonal_is_not_a_backdrop(self):
        self.assertEqual(cm.find_backdrops(groups(10, 50.0, 100.0, 300.0, 5000.0)), [])

    def test_wmos_with_fewer_than_three_groups_have_no_median_to_compare(self):
        self.assertEqual(cm.find_backdrops(groups(1, 50.0, 100.0, 5000.0, 99999.0)), [])


class GeometryTest(unittest.TestCase):
    def test_winding_gives_up_and_down_normals(self):
        V = np.array([[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 5], [0, 10, 5], [10, 0, 5.0]])
        T = np.array([[0, 1, 2], [3, 4, 5]])
        area, nz, cen = cm.tri_geometry(V, T)
        self.assertEqual(list(np.round(nz)), [1.0, -1.0])
        self.assertEqual(list(area), [50.0, 50.0])
        self.assertAlmostEqual(cen[1][2], 5.0)

    def test_buried_mask_needs_terrain_above_and_no_hole(self):
        gz = np.array([10.0, 10.0, np.nan, 10.0, 10.0])
        hole = np.array([False, False, False, True, False])
        fz = np.array([5.0, 9.8, 0.0, 0.0, 9.0])
        # under terrain by > 0.5 | only 0.2 under | no terrain fetched | under a hole | 1 under
        self.assertEqual(list(cm.buried_mask(gz, hole, fz)), [True, False, False, False, True])

    def test_rect_gap(self):
        pts = np.array([[0.0, 0.0], [100.0, 0.0]])
        self.assertEqual(cm.rect_gap(pts, np.array([-1.0, -1.0]), np.array([1.0, 1.0])), 0.0)
        self.assertAlmostEqual(cm.rect_gap(pts, np.array([103.0, 4.0]), np.array([110.0, 9.0])), 5.0)


def flat_chunk(x0, y0, z, hole_cell=None):
    holes = 0
    if hole_cell:
        holes = 1 << (hole_cell[0] * 8 + hole_cell[1])
    return {"ix": 0, "iy": 0, "x0": x0, "y0": y0, "heights": np.full(145, float(z)),
            "holes_hi": holes, "holes_lo": 0}


class GroundTest(unittest.TestCase):
    def test_samples_flat_terrain_holes_and_missing_tiles(self):
        x0 = cm.adt2obj.MAPC - 40 * cm.adt2obj.CHUNK  # on the chunk lattice
        ground = cm.Ground([flat_chunk(x0, x0, 20.0, hole_cell=(0, 0))])
        u = cm.adt2obj.UNIT
        z, hole = ground.sample([x0 - 3 * u - 1, x0 - 0.5 * u, 1.0], [x0 - 3 * u - 1, x0 - 0.5 * u, 1.0])
        self.assertAlmostEqual(z[0], 20.0)
        self.assertFalse(hole[0])
        self.assertTrue(hole[1])        # first cell is a hole
        self.assertTrue(np.isnan(z[2]))  # nowhere near a fetched chunk

    def test_no_chunks_is_all_uncovered(self):
        z, hole = cm.Ground([]).sample([0.0], [0.0])
        self.assertTrue(np.isnan(z[0]))
        self.assertFalse(hole[0])


def room(floor_z, ceiling_z, size=10.0):
    """One floor quad (up) and one ceiling quad (down) over each other."""
    V = np.array([[0, 0, floor_z], [size, 0, floor_z], [size, size, floor_z], [0, size, floor_z],
                  [0, 0, ceiling_z], [size, 0, ceiling_z], [size, size, ceiling_z], [0, size, ceiling_z]], float)
    T = np.array([[0, 1, 2], [0, 2, 3],        # counter-clockwise from +z: up
                  [4, 6, 5], [4, 7, 6]])       # clockwise from +z: down
    return V, T


class CeilingDropTest(unittest.TestCase):
    def test_drop_is_the_gap_to_the_floor_below(self):
        d = cm.ceiling_drops(*room(0.0, 12.5))
        self.assertEqual(len(d), 2)
        self.assertTrue(np.allclose(d, 12.5))

    def test_ceiling_without_floor_below_is_skipped(self):
        V, T = room(0.0, 12.5)
        V[4:, 0] += 100  # ceiling slides away from the floor
        self.assertEqual(len(cm.ceiling_drops(V, T)), 0)

    def test_nearest_floor_wins(self):
        V, T = room(0.0, 40.0)
        V2, T2 = room(30.0, 90.0)  # an upper floor at z 30 (its ceiling is out of the way, far above)
        mesh_V = np.vstack([V, V2[:4]])
        mesh_T = np.vstack([T, T2[:2] + 8])
        d = cm.ceiling_drops(mesh_V, mesh_T)
        self.assertTrue(np.allclose(d, 10.0))

    def test_summary_and_suggestion(self):
        s = cm.drop_summary(np.linspace(0, 65.3, 101))
        self.assertEqual(s["max"], 65.3)
        self.assertEqual(cm.drop_summary(np.zeros(0)), None)
        mast = {"p95": 64.5, "max": 65.3}
        self.assertEqual(cm.suggest_roof_max_drop([mast, {"p95": 11.0, "max": 18.0}]), 70)
        # nothing past the default reach (+ slack): no suggestion
        self.assertIsNone(cm.suggest_roof_max_drop([{"p95": 25.1, "max": 26.5}, {"p95": 3.0, "max": 5.0}]))


class WarningRuleTest(unittest.TestCase):
    def cls(self, backdrops=(), share=None, buried=None, fid=1):
        return {"backdrops": [dict(b, fid=fid) for b in backdrops],
                "dominant_interior": None if share is None else {"fid": fid, "share": share, "interior_buried": buried}}

    def test_deadmines_numbers_warn(self):
        bd = {"gi": 45, "diag_x_median": 28.5, "area_x_others": 6.09}
        self.assertTrue(cm.warning_triggers(self.cls([bd], 0.94, 0.991)))
        self.assertEqual(len(cm.warning_triggers(self.cls([], 0.94, 0.991))), 1)  # dominant rule alone
        self.assertEqual(len(cm.warning_triggers(self.cls([bd], 0.1, 0.1))), 1)   # backdrop alone

    def test_gate_map_numbers_stay_quiet(self):
        self.assertEqual(cm.warning_triggers(self.cls([], 0.98, 0.856)), [])  # Lordaeron: the Undercity is buried by design
        self.assertEqual(cm.warning_triggers(self.cls([], 0.26, 0.997)), [])  # Zul'Gurub: buried caves, minor share
        self.assertEqual(cm.warning_triggers(self.cls([], None, None)), [])

    def test_block_text(self):
        c = dict(self.cls([{"gi": 45, "diag_x_median": 28.5, "area_x_others": 6.09}]),
                 warning_triggers=["why"])
        self.assertIn("PLACED-WMO DUNGEON", cm.warning_block(c, "deadmines"))
        self.assertIsNone(cm.warning_block(dict(c, warning_triggers=[]), "x"))


class FetchHookTest(unittest.TestCase):
    """fetch_map.warn_if_placed_wmo_dungeon is additive: silent maps keep fetch.json untouched, failures never raise."""

    def run_hook(self, **classify_kw):
        with tempfile.TemporaryDirectory() as td:
            fj = Path(td) / "fetch.json"
            fj.write_text('{"kind": "terrain"}')
            err = io.StringIO()
            with mock.patch.object(cm, "classify", **classify_kw), contextlib.redirect_stderr(err):
                fetch_map.warn_if_placed_wmo_dungeon("x", td, {"kind": "terrain"})
            return fj.read_text(), err.getvalue()

    def test_quiet_map_leaves_fetch_json_and_stderr_alone(self):
        text, err = self.run_hook(return_value={"warning_triggers": [], "backdrops": []})
        self.assertEqual(text, '{"kind": "terrain"}')
        self.assertEqual(err, "")

    def test_warning_prints_and_records_classification(self):
        c = {"warning_triggers": ["why"], "backdrops": [], "_rows": []}
        text, err = self.run_hook(return_value=c)
        self.assertIn("PLACED-WMO DUNGEON", err)
        self.assertEqual(json.loads(text), {"kind": "terrain", "classification": {"warning_triggers": ["why"], "backdrops": []}})

    def test_classifier_failure_is_logged_not_raised(self):
        text, err = self.run_hook(side_effect=ValueError("boom"))
        self.assertEqual(text, '{"kind": "terrain"}')
        self.assertIn("classification skipped", err)


if __name__ == "__main__":
    unittest.main()
