import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import floor_config  # noqa: E402


class FloorConfigTest(unittest.TestCase):
    def test_legacy_workflow_keeps_names_and_map_level_render(self):
        self.assertIsNone(floor_config.resolve_floor({}))
        self.assertEqual("v007-first-pass", floor_config.version_name(7, "First pass", None))
        self.assertEqual("v007-", floor_config.version_name(7, "", None))
        self.assertEqual("cavern", floor_config.asset_slug("cavern", None))
        render = {"width": 2400}
        self.assertEqual({"mapID": 43, "renders": render},
                         floor_config.publication_render_entry(43, render, None))
        mesh = {"frame": "wow-yup-mirrored-x"}
        self.assertEqual({"mapID": 43, "mesh": mesh},
                         floor_config.publication_mesh_entry(43, mesh, None))

    def test_floor_workflow_normalizes_selection_and_names_outputs(self):
        floor = floor_config.resolve_floor({"floor": {
            "id": 2,
            "object_include_prefixes": ["group_20", "liquid_", "group_20"],
            "object_exclude_prefixes": "group_20_ceiling",
            "z_min": -30,
            "z_max": 15.5,
        }})
        self.assertEqual({
            "floor": 2,
            "object_include_prefixes": ["group_20", "liquid_"],
            "object_exclude_prefixes": ["group_20_ceiling"],
            "z_min": -30,
            "z_max": 15.5,
        }, floor)
        self.assertEqual("v003-floor-2-final", floor_config.version_name(3, "Final", floor))
        self.assertEqual("cavern-floor-2", floor_config.asset_slug("cavern", floor))
        render = {"width": 2400}
        self.assertEqual({"mapID": 43, "floors": [{"floor": 2, "renders": render}]},
                         floor_config.publication_render_entry(43, render, floor))
        mesh = {"frame": "wow-yup-mirrored-x"}
        self.assertEqual({"mapID": 43, "floors": [{"floor": 2, "mesh": mesh}]},
                         floor_config.publication_mesh_entry(43, mesh, floor))

    def test_cli_floor_supplies_or_overrides_identifier(self):
        self.assertEqual(4, floor_config.resolve_floor({}, 4)["floor"])
        floor = floor_config.resolve_floor({"floor": {"id": 1, "z_min": 0}}, 3)
        self.assertEqual(3, floor["floor"])
        self.assertEqual(0, floor["z_min"])

    def test_rejects_ambiguous_or_invalid_floor_configuration(self):
        for config in (
            {"floor": {"z_min": 1}},
            {"floor": -1},
            {"floor": {"id": 1, "z_min": 2, "z_max": 2}},
            {"floor": {"id": 1, "object_include_prefixes": []}},
            {"floor": {"id": 1, "unexpected": True}},
        ):
            with self.subTest(config=config), self.assertRaises(ValueError):
                floor_config.resolve_floor(config)


if __name__ == "__main__":
    unittest.main()
