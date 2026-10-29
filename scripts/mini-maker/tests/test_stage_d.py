import json
import os
import shutil
import struct
import sys
import tempfile
import unittest
from types import SimpleNamespace

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib import gate, glbtools, stage_d


def _pad4(b):
    return b + b"\x00" * ((4 - len(b) % 4) % 4)


def make_glb(path, n_triangles):
    """A flat fan of n_triangles sharing vertex 0 — enough geometry for
    glbtools to round-trip, cheap to generate at any size."""
    positions = [(0.0, 0.0, 0.0)]
    indices = []
    for i in range(n_triangles):
        positions.append((float(i + 1), 0.0, 0.0))
        positions.append((float(i + 1), 1.0, 0.0))
        indices += [0, len(positions) - 2, len(positions) - 1]

    pos_bytes = _pad4(b"".join(struct.pack("<3f", *p) for p in positions))
    idx_bytes = _pad4(b"".join(struct.pack("<I", i) for i in indices))
    bin_chunk = pos_bytes + idx_bytes
    xs = [p[0] for p in positions]; ys = [p[1] for p in positions]; zs = [p[2] for p in positions]
    gltf = {
        "asset": {"version": "2.0"},
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "mode": 4}]}],
        "buffers": [{"byteLength": len(bin_chunk)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(b"".join(struct.pack('<3f', *p) for p in positions))},
            {"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(b"".join(struct.pack('<I', i) for i in indices))},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": 1, "componentType": 5125, "count": len(indices), "type": "SCALAR"},
        ],
    }
    json_bytes = _pad4(json.dumps(gltf).encode("utf-8"))
    with open(path, "wb") as f:
        total = 12 + 8 + len(json_bytes) + 8 + len(bin_chunk)
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_chunk), 0x004E4942))
        f.write(bin_chunk)


def _seed_mesh_approved(slug, raw_faces, root="work"):
    mesh_dir = os.path.join(gate.out_dir(slug, root), "mesh")
    os.makedirs(mesh_dir, exist_ok=True)
    make_glb(os.path.join(mesh_dir, "raw.glb"), raw_faces)
    gate.save_meta(slug, {
        "slug": slug,
        "mesh_status": gate.MESH_APPROVED,
        "mesh_approved_by": "manual",
    }, root)


class DirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cwd = os.getcwd()
        os.chdir(self.tmp)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)


def _stub_run_cmd(small_output_faces=5):
    """A subprocess.run stand-in: never shells out to npx. `simplify`,
    `draco` and `meshopt` all write a smaller (but still valid, readable)
    fixture glb to their dst path — real `draco`/`meshopt` output isn't
    valid-without-a-real-decoder, but Stage D's own measurement step
    (mini-003) reads its compressed output back via `dequantize`, so the
    stub's fixture has to stay parseable. `dequantize` is a no-op copy: the
    fixture was never really quantized, and has no node to remap.
    """
    def run(args, capture_output=True, text=True):
        verb, src, dst = args[3], args[4], args[5]
        if verb in ("simplify", "draco", "meshopt"):
            make_glb(dst, small_output_faces)
        elif verb == "dequantize":
            shutil.copyfile(src, dst)
        return SimpleNamespace(returncode=0, stdout="", stderr="")
    return run


class CompressHeroTests(DirTest):
    def test_small_raw_mesh_skips_decimation(self):
        _seed_mesh_approved("small-hero", raw_faces=100)  # well under 50K
        meta = stage_d.compress_hero("small-hero", run_cmd=_stub_run_cmd())

        self.assertTrue(os.path.exists("work/small-hero/mesh/print.stl"))
        self.assertTrue(os.path.exists("work/small-hero/mesh/web.glb"))
        self.assertEqual(meta["stage_d"]["print"]["faces_before"], 100)
        self.assertEqual(meta["stage_d"]["print"]["faces_after"], 100)
        self.assertIn("none", meta["stage_d"]["print"]["technique"])
        self.assertEqual(glbtools.stl_facet_count("work/small-hero/mesh/print.stl"), 100)

    def test_large_raw_mesh_is_decimated_via_gltf_transform(self):
        _seed_mesh_approved("big-hero", raw_faces=600_000)
        meta = stage_d.compress_hero("big-hero", run_cmd=_stub_run_cmd(small_output_faces=5))

        self.assertEqual(meta["stage_d"]["print"]["faces_before"], 600_000)
        self.assertEqual(meta["stage_d"]["print"]["faces_after"], 5)
        self.assertIn("simplify", meta["stage_d"]["print"]["technique"])
        self.assertEqual(glbtools.stl_facet_count("work/big-hero/mesh/print.stl"), 5)
        # temp decimated glb is cleaned up
        self.assertFalse(os.path.exists("work/big-hero/mesh/_print_decimated.glb"))
        self.assertFalse(os.path.exists("work/big-hero/mesh/_web_simplified.glb"))
        self.assertIn("simplify", meta["stage_d"]["web"]["technique"])
        self.assertIn("Draco", meta["stage_d"]["web"]["technique"])

    def test_play_tiers_are_written_meshopt_compressed_and_base_normalised(self):
        _seed_mesh_approved("play-hero", raw_faces=600_000)
        meta = stage_d.compress_hero("play-hero", run_cmd=_stub_run_cmd(small_output_faces=5))

        self.assertTrue(os.path.exists("work/play-hero/mesh/play.glb"))
        self.assertTrue(os.path.exists("work/play-hero/mesh/play-15k.glb"))

        for key in ("play", "play_15k"):
            tier = meta["stage_d"][key]
            self.assertIn("meshopt", tier["technique"])
            self.assertIn("EXT_meshopt_compression", tier["technique"])
            self.assertIn("KHR_mesh_quantization", tier["technique"])
            self.assertLess(tier["bytes_after"], tier["bytes_before"])
            self.assertAlmostEqual(tier["bounds_after"]["min"][1], 0.0, places=9)
            self.assertIn("footprint_source", tier)
            self.assertIn("scale_applied", tier)
            bd = tier["base_diameter"]
            self.assertAlmostEqual(bd["value"], (bd["x_extent"] + bd["z_extent"]) / 2)
            self.assertEqual(bd["slice_frac"], stage_d.FOOTPRINT_SLICE_FRAC)
            self.assertEqual(set(bd["bands"].keys()), {"0.01", "0.02", "0.05"})
            # the fan-fixture geometry is flat in z, so only x_extent is
            # guaranteed nonzero here; base_diameter is the pair's mean.
            self.assertGreater(bd["x_extent"], 0)

        # measurement temp files are cleaned up
        for f in ("_play_decoded_check.glb", "_play_15k_decoded_check.glb"):
            self.assertFalse(os.path.exists(f"work/play-hero/mesh/{f}"))

        # temp files are cleaned up
        for f in ("_play_simplified.glb", "_play_normalized.glb",
                   "_play_15k_simplified.glb", "_play_15k_normalized.glb"):
            self.assertFalse(os.path.exists(f"work/play-hero/mesh/{f}"))

    def test_play_tiers_record_the_crease_split_normals_meta(self):
        _seed_mesh_approved("crease-hero", raw_faces=600_000)
        meta = stage_d.compress_hero("crease-hero", run_cmd=_stub_run_cmd(small_output_faces=5))

        for key in ("play", "play_15k"):
            tier = meta["stage_d"][key]
            self.assertEqual(tier["normals"], "crease-split 45deg, recomputed after simplify")
            self.assertIn("crease-split", tier["technique"])
            self.assertIn("45deg", tier["technique"])
            self.assertIn("vertices_after", tier)

    def test_play_glb_over_byte_budget_fails_loudly(self):
        _seed_mesh_approved("oversize-hero", raw_faces=600_000)

        def run(args, capture_output=True, text=True):
            verb, src, dst = args[3], args[4], args[5]
            if verb == "meshopt":
                # Oversized fixture: bigger than stage_d.PLAY_BYTE_BUDGET, so
                # the play tier's guard must raise instead of shipping it.
                make_glb(dst, 20_000)
            elif verb in ("simplify", "draco"):
                make_glb(dst, 5)
            elif verb == "dequantize":
                shutil.copyfile(src, dst)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with self.assertRaises(stage_d.CompressError) as ctx:
            stage_d.compress_hero("oversize-hero", run_cmd=run)
        self.assertIn("play", str(ctx.exception))
        self.assertIn("budget", str(ctx.exception))

    def test_play_15k_target_is_lighter_than_play(self):
        self.assertLess(stage_d.PLAY_15K_TARGET_FACES, stage_d.PLAY_TARGET_FACES)

    def test_web_glb_skips_simplify_under_ceiling(self):
        _seed_mesh_approved("small-web-hero", raw_faces=1000)
        meta = stage_d.compress_hero("small-web-hero", run_cmd=_stub_run_cmd())
        self.assertNotIn("simplify", meta["stage_d"]["web"]["technique"])

    def test_web_glb_is_smaller_than_raw(self):
        _seed_mesh_approved("web-hero", raw_faces=1000)
        meta = stage_d.compress_hero("web-hero", run_cmd=_stub_run_cmd())
        web = meta["stage_d"]["web"]
        self.assertLess(web["bytes_after"], web["bytes_before"])

    def test_refuses_a_slug_that_is_not_mesh_approved(self):
        gate.save_meta("not-ready", {"mesh_status": gate.MESH_PENDING})
        with self.assertRaises(gate.GateError):
            stage_d.compress_hero("not-ready", run_cmd=_stub_run_cmd())

    def test_refuses_missing_raw_glb(self):
        gate.save_meta("no-raw", {"mesh_status": gate.MESH_APPROVED, "mesh_approved_by": "manual"})
        with self.assertRaises(stage_d.CompressError):
            stage_d.compress_hero("no-raw", run_cmd=_stub_run_cmd())


if __name__ == "__main__":
    unittest.main()
