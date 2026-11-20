import os
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import adt2obj  # noqa: E402
import m2obj  # noqa: E402


class ConvertTexturesTest(unittest.TestCase):
    def test_empty_and_undecodable_textures_are_reported_not_fatal(self):
        with tempfile.TemporaryDirectory() as d:
            empty = os.path.join(d, "8512854.blp")  # the CDN served Excavation Site's campfire texture as 0 bytes
            open(empty, "wb").close()
            garbage = os.path.join(d, "2.blp")
            with open(garbage, "wb") as f:
                f.write(b"BLP2" + bytes(12))
            good = os.path.join(d, "3.blp")
            Image.new("RGBA", (4, 4), (10, 20, 30, 255)).save(good, format="PNG")  # Pillow sniffs content
            absent = os.path.join(d, "4.blp")

            missing = m2obj.convert_textures([empty, garbage, good, absent], log=lambda *_: None)

            self.assertEqual(missing, [empty, garbage, absent])
            self.assertFalse(os.path.exists(empty[:-4] + ".png"))
            self.assertFalse(os.path.exists(garbage[:-4] + ".png"))
            self.assertEqual(Image.open(good[:-4] + ".png").size, (4, 4))
            # an existing PNG (e.g. a hand-made placeholder) is left alone
            self.assertEqual(m2obj.convert_textures([good], log=lambda *_: None), [])


class MaterialTest(unittest.TestCase):
    def test_material_key(self):
        self.assertEqual(adt2obj.m2_material({"tex": 203537, "flags": 0x4, "blend": 1}), "m2_t203537_ds_b1")
        self.assertEqual(adt2obj.m2_material({"tex": 203528, "flags": 0x10, "blend": 0}), "m2_t203528_b0")
        self.assertEqual(adt2obj.m2_material({"tex": None, "flags": 0, "blend": 7}), "m2_t0_b1")
        # export_glb / blender_topdown read the blend mode from the last `_b`
        self.assertEqual(adt2obj.m2_material({"tex": 5, "flags": 4, "blend": 1}).rsplit("_b", 1)[-1], "1")


class ExclusionTest(unittest.TestCase):
    def test_fids_and_listfile_substrings(self):
        with tempfile.TemporaryDirectory() as w:
            mdir = os.path.join(w, "maps", "some-map")
            os.makedirs(mdir)
            os.makedirs(os.path.join(w, "cache"))
            with open(os.path.join(w, "cache", "community-listfile.csv"), "w") as f:
                f.write("203545;world/khazmodan/wetlands/passivedoodads/trees/wetlandtree03.m2\n"
                        "915402;world/critter/fish/FishSkinny03.m2\n"
                        "915403;world/critter/fish/fishskinny03.skin\n"
                        "189700;world/azeroth/elwynn/passivedoodads/bush/elwynnbush09.m2\n")
            ex = adt2obj.m2_exclusions(mdir, "fish, 7545282,WetlandTree")
            self.assertEqual(ex(915402), "name fish")
            self.assertEqual(ex(203545), "name wetlandtree")
            self.assertEqual(ex(7545282), "fid")
            self.assertIsNone(ex(189700))
            self.assertIsNone(ex(915403))
            self.assertIsNone(adt2obj.m2_exclusions(mdir, "")(203545))

    def test_max_height_shrinks_scaled_foliage_only(self):
        def part(z0, z1, blend=0, flags=0):
            return {"verts": np.array([[0, 0, z0], [1, 0, z1], [0, 1, z1]], float), "tris": [(0, 1, 2)],
                    "blend": blend, "flags": flags}
        # trunk + leaf cards (two-sided, alpha-keyed); the blended glow is not exported and does not count
        tree = {"parts": [part(0, 10), part(5, 9, blend=1, flags=0x4), part(0, 30, blend=2)]}
        self.assertEqual(adt2obj.m2_shrink(tree, {"scale": 1.0}, 0), 1.0)
        self.assertEqual(adt2obj.m2_shrink(tree, {"scale": 1.0}, 12), 1.0)
        self.assertAlmostEqual(adt2obj.m2_shrink(tree, {"scale": 1.5}, 12), 0.8)
        barrier = {"parts": [part(0, 50)]}
        crane = {"parts": [part(0, 30), part(0, 32, flags=0x4)]}  # two-sided but opaque ropes
        self.assertEqual(adt2obj.m2_shrink(barrier, {"scale": 1.0}, 12), 1.0)
        self.assertEqual(adt2obj.m2_shrink(crane, {"scale": 1.0}, 12), 1.0)


if __name__ == "__main__":
    unittest.main()
