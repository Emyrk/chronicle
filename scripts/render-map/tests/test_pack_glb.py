import json
import os
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import pack_glb  # noqa: E402

# Stands in for gltfpack: writes `-o` as a GLB whose extensionsUsed is argv[1].
FAKE = """import json, struct, sys
ext = json.loads(sys.argv[1])
out = sys.argv[sys.argv.index("-o") + 1]
body = json.dumps({"asset": {"version": "2.0"}, "extensionsUsed": ext}).encode()
body += b" " * (-len(body) % 4)
open(out, "wb").write(b"glTF" + struct.pack("<II", 2, 20 + len(body)) + struct.pack("<II", len(body), 0x4E4F534A) + body)
"""


def write_glb(path, extensions):
    body = json.dumps({"asset": {"version": "2.0"}, "extensionsUsed": extensions}).encode()
    body += b" " * (-len(body) % 4)
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 20 + len(body)) + struct.pack("<II", len(body), 0x4E4F534A) + body)


class PackGlbTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.fake = self.root / "fake_gltfpack.py"
        self.fake.write_text(FAKE)
        self.src = self.root / "wc-open-top.glb"
        write_glb(self.src, ["EXT_texture_webp"])

    def tearDown(self):
        self.temporary.cleanup()

    def cmd(self, extensions):
        return [sys.executable, str(self.fake), json.dumps(extensions)]

    def test_writes_meshopt_glb_beside_the_source(self):
        dst = pack_glb.pack(str(self.src), self.cmd([pack_glb.MESHOPT]))
        self.assertEqual(dst, str(self.root / "wc-open-top-meshopt.glb"))
        self.assertIn(pack_glb.MESHOPT, pack_glb.extensions_used(dst))
        self.assertTrue(self.src.exists())

    def test_rejects_output_without_meshopt(self):
        with self.assertRaises(SystemExit):
            pack_glb.pack(str(self.src), self.cmd([]))
        self.assertFalse(os.path.exists(pack_glb.packed_path(str(self.src))))

    def test_refuses_to_overwrite(self):
        pack_glb.pack(str(self.src), self.cmd([pack_glb.MESHOPT]))
        with self.assertRaises(SystemExit):
            pack_glb.pack(str(self.src), self.cmd([pack_glb.MESHOPT]))

    def test_refuses_an_already_packed_glb(self):
        write_glb(self.src, [pack_glb.MESHOPT])
        with self.assertRaises(SystemExit):
            pack_glb.pack(str(self.src), self.cmd([pack_glb.MESHOPT]))


if __name__ == "__main__":
    unittest.main()
