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

from mini_lib import gate, import_mesh, stage_d


def _pad4(b):
    return b + b"\x00" * ((4 - len(b) % 4) % 4)


def make_glb(path, n_triangles):
    """A flat fan of n_triangles sharing vertex 0 (see tests/test_stage_d.py)."""
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


def _stub_run_cmd(small_output_faces=5):
    def run(args, capture_output=True, text=True):
        verb, src, dst = args[3], args[4], args[5]
        if verb in ("simplify", "draco", "meshopt"):
            make_glb(dst, small_output_faces)
        elif verb == "dequantize":
            shutil.copyfile(src, dst)
        return SimpleNamespace(returncode=0, stdout="", stderr="")
    return run


class DirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cwd = os.getcwd()
        os.chdir(self.tmp)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)


class ImportMeshTests(DirTest):
    def test_copies_glb_and_records_import_block(self):
        os.makedirs("source")
        make_glb("source/raw.glb", 42)

        meta = import_mesh.import_mesh("some-hero", "source/raw.glb")

        self.assertTrue(os.path.exists("work/some-hero/mesh/raw.glb"))
        self.assertEqual(meta["mesh_status"], gate.MESH_PENDING)
        self.assertIsNone(meta["mesh_approved_by"])
        self.assertIsNone(meta["mesh_approved_at"])
        self.assertEqual(meta["meshy"]["source"], "meshy-web-ui")
        self.assertEqual(meta["meshy"]["triangle_count"], 42)
        self.assertTrue(meta["meshy"]["original_path"].endswith("source/raw.glb"))
        self.assertEqual(len(meta["meshy"]["sha256"]), 64)

    def test_never_sets_mesh_approved(self):
        os.makedirs("source")
        make_glb("source/raw.glb", 10)
        meta = import_mesh.import_mesh("never-approved", "source/raw.glb")
        self.assertNotEqual(meta["mesh_status"], gate.MESH_APPROVED)

    def test_source_file_is_copied_not_moved(self):
        os.makedirs("source")
        make_glb("source/raw.glb", 10)
        import_mesh.import_mesh("copy-hero", "source/raw.glb")
        self.assertTrue(os.path.exists("source/raw.glb"))

    def test_stills_from_copies_hero_yaml_and_stills(self):
        os.makedirs("sibling")
        os.makedirs("source")
        make_glb("source/raw.glb", 10)
        with open("sibling/hero.yaml", "w") as f:
            f.write("slug: stills-hero\n")
        with open("sibling/front.png", "wb") as f:
            f.write(b"front-bytes")
        with open("sibling/prompt.txt", "w") as f:
            f.write("prompt")

        meta = import_mesh.import_mesh("stills-hero", "source/raw.glb", stills_from="sibling")

        self.assertTrue(os.path.exists("work/stills-hero/hero.yaml"))
        self.assertTrue(os.path.exists("work/stills-hero/front.png"))
        self.assertTrue(os.path.exists("work/stills-hero/prompt.txt"))
        self.assertFalse(os.path.exists("work/stills-hero/back.png"))
        self.assertEqual(
            sorted(meta["meshy"]["stills_from"]["files"]),
            sorted(["hero.yaml", "front.png", "prompt.txt"]),
        )

    def test_updates_existing_out_dir_in_place(self):
        gate.save_meta("existing-hero", {"slug": "existing-hero", "stills_status": "stills_approved", "views": ["front"]})
        os.makedirs("source")
        make_glb("source/raw.glb", 10)

        meta = import_mesh.import_mesh("existing-hero", "source/raw.glb")

        self.assertEqual(meta["stills_status"], "stills_approved")
        self.assertEqual(meta["mesh_status"], gate.MESH_PENDING)

    def test_compress_then_runs_on_an_imported_slug_once_approved(self):
        os.makedirs("source")
        make_glb("source/raw.glb", 600_000)
        import_mesh.import_mesh("import-then-compress", "source/raw.glb")

        meta = gate.load_meta("import-then-compress")
        gate.set_gate(meta, "mesh_status", gate.MESH_APPROVED, gate.MESH_REJECTED,
                       reject=False, gate_by="manual")
        gate.save_meta("import-then-compress", meta)

        result = stage_d.compress_hero("import-then-compress", run_cmd=_stub_run_cmd())
        self.assertTrue(os.path.exists("work/import-then-compress/mesh/play.glb"))
        self.assertIn("stage_d", result)


if __name__ == "__main__":
    unittest.main()
