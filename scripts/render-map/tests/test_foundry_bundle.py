import copy
import hashlib
import json
import os
import stat
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import foundry_bundle  # noqa: E402


class FoundryBundleTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.render = self.root / "source render.png"
        self.mesh = self.root / "source mesh.glb"
        self.render.write_bytes(b"render-pixels\x00\x01")
        self.mesh.write_bytes(b"glTF-mesh\x02\x03")
        self.stage = {
            "namespace": "azerothcore",
            "mapID": 533,
            "name": "Naxxramas",
            "status": "ready",
            "floors": [self.floor(2, "Construct Quarter")],
        }

    def tearDown(self):
        self.temporary.cleanup()

    def asset(self, path):
        data = path.read_bytes()
        return {
            "path": str(path),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }

    def floor(self, floor_id, name="Floor"):
        bounds = {"minX": 1.5, "maxX": 20, "minY": -30, "maxY": -2.5}
        return {
            "floor": floor_id,
            "name": name,
            "version": "v001",
            "render": {
                **self.asset(self.render),
                "width": 2400,
                "height": 1800,
                "bounds": dict(bounds),
            },
            "mesh": {
                **self.asset(self.mesh),
                "bounds": dict(bounds),
                "zMin": -12.25,
                "zMax": 44,
                "frame": "wow-yup-mirrored-x",
                "liquid": {"color": "#AABBCC", "opacity": 0.85},
            },
        }

    def test_writes_deterministic_stored_archive_with_portable_manifest(self):
        first_floor = self.floor(1, "Arachnid Quarter")
        first_floor["preferred2D"] = "art"
        self.stage["floors"].append(first_floor)
        manifest, assets = foundry_bundle.build_manifest(self.stage)
        first = self.root / "first.zip"
        second = self.root / "second.zip"
        foundry_bundle.write_bundle(first, manifest, assets)

        os.utime(self.render, (2_000_000_000, 2_000_000_000))
        os.chmod(self.mesh, 0o600)
        foundry_bundle.write_bundle(second, manifest, assets)

        self.assertEqual(first.read_bytes(), second.read_bytes())
        with zipfile.ZipFile(first) as bundle:
            self.assertEqual([
                "foundry.json",
                "maps/533/floor-1/mesh.glb",
                "maps/533/floor-1/render.png",
                "maps/533/floor-2/mesh.glb",
                "maps/533/floor-2/render.png",
            ], bundle.namelist())
            for info in bundle.infolist():
                self.assertEqual(zipfile.ZIP_STORED, info.compress_type)
                self.assertEqual((1980, 1, 1, 0, 0, 0), info.date_time)
                self.assertEqual(stat.S_IFREG | 0o644, info.external_attr >> 16)
            foundry = json.loads(bundle.read("foundry.json"))
            self.assertEqual("chronicle-map-foundry-bundle-v1", foundry["format"])
            self.assertEqual("azerothcore", foundry["namespace"])
            self.assertEqual([1, 2], [floor["floor"] for floor in foundry["maps"][0]["floors"]])
            floor = foundry["maps"][0]["floors"][0]
            self.assertEqual("maps/533/floor-1/render.png", floor["render"]["file"])
            self.assertEqual("maps/533/floor-1/mesh.glb", floor["mesh"]["file"])
            self.assertEqual("art", floor["preferred2D"])
            self.assertEqual("renders", foundry["maps"][0]["floors"][1]["preferred2D"])
            self.assertEqual({"color": "#aabbcc", "opacity": 0.85}, floor["mesh"]["liquid"])
            self.assertNotIn(str(self.root), bundle.read("foundry.json").decode())
            self.assertEqual(self.render.read_bytes(), bundle.read("maps/533/floor-1/render.png"))
            self.assertEqual(self.mesh.read_bytes(), bundle.read("maps/533/floor-1/mesh.glb"))

    def test_supports_multiple_maps_and_sorts_them(self):
        other = copy.deepcopy(self.stage)
        other["mapID"] = 1
        other["name"] = "Other"
        multi = {"namespace": "azerothcore", "maps": [self.stage, other]}
        manifest, _ = foundry_bundle.build_manifest(multi)
        self.assertEqual([1, 533], [item["mapID"] for item in manifest["maps"]])

        duplicate = {"namespace": "azerothcore", "maps": [self.stage, self.stage]}
        with self.assertRaisesRegex(foundry_bundle.BundleError, "duplicate mapID"):
            foundry_bundle.build_manifest(duplicate)

    def test_rejects_schema_and_calibration_errors(self):
        cases = []

        missing_namespace = copy.deepcopy(self.stage)
        del missing_namespace["namespace"]
        cases.append((missing_namespace, "namespace"))

        duplicate_floor = copy.deepcopy(self.stage)
        duplicate_floor["floors"].append(copy.deepcopy(duplicate_floor["floors"][0]))
        cases.append((duplicate_floor, "duplicate floor"))

        mismatched_bounds = copy.deepcopy(self.stage)
        mismatched_bounds["floors"][0]["mesh"]["bounds"]["maxX"] = 21
        cases.append((mismatched_bounds, "bounds differ"))

        bad_dimensions = copy.deepcopy(self.stage)
        bad_dimensions["floors"][0]["render"]["width"] = 0
        cases.append((bad_dimensions, "width"))

        bad_z = copy.deepcopy(self.stage)
        bad_z["floors"][0]["mesh"]["zMax"] = -12.25
        cases.append((bad_z, "zMin < zMax"))

        bad_frame = copy.deepcopy(self.stage)
        bad_frame["floors"][0]["mesh"]["frame"] = "unknown"
        cases.append((bad_frame, "wow-yup-mirrored-x"))

        bad_liquid = copy.deepcopy(self.stage)
        bad_liquid["floors"][0]["mesh"]["liquid"]["opacity"] = 0
        cases.append((bad_liquid, "opacity"))

        bad_preferred_2d = copy.deepcopy(self.stage)
        bad_preferred_2d["floors"][0]["preferred2D"] = "native"
        cases.append((bad_preferred_2d, "preferred2D"))

        for stage, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(
                foundry_bundle.BundleError, message
            ):
                foundry_bundle.build_manifest(stage)

    def test_rejects_changed_or_oversized_assets(self):
        changed = copy.deepcopy(self.stage)
        changed["floors"][0]["render"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(foundry_bundle.BundleError, "hashes to"):
            foundry_bundle.build_manifest(changed)

        oversized = self.root / "oversized.glb"
        with oversized.open("wb") as asset:
            asset.truncate(foundry_bundle.MAX_ASSET_BYTES + 1)
        too_large = copy.deepcopy(self.stage)
        too_large["floors"][0]["mesh"].update({
            "path": str(oversized),
            "bytes": foundry_bundle.MAX_ASSET_BYTES + 1,
            "sha256": "0" * 64,
        })
        with self.assertRaisesRegex(foundry_bundle.BundleError, "100 MB"):
            foundry_bundle.build_manifest(too_large)


if __name__ == "__main__":
    unittest.main()
