import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import adt2obj  # noqa: E402


def chunk(tag, payload):
    return tag[::-1].encode("ascii") + struct.pack("<I", len(payload)) + payload


def monolithic_mcnk(height_offset=128):
    header = bytearray(128)
    mcvt = struct.pack("<145f", *[float(i) for i in range(145)])
    mcly_offset = 128 + len(mcvt)
    layers = struct.pack("<4I", 0, 0, 0, 0) + struct.pack("<4I", 1, 0, 0, 0)
    mcal_offset = mcly_offset + len(layers)
    alpha = bytes([0xF0]) * 2048
    struct.pack_into("<4I", header, 0, 0, 3, 4, 2)
    struct.pack_into("<I", header, 0x14, height_offset)
    struct.pack_into("<I", header, 0x1C, mcly_offset)
    struct.pack_into("<I", header, 0x24, mcal_offset)
    struct.pack_into("<I", header, 0x28, len(alpha))
    struct.pack_into("<H", header, 0x3C, 0x21)
    struct.pack_into("<3f", header, 0x68, 100.0, 200.0, 10.0)
    return bytes(header) + mcvt + layers + alpha


class MonolithicAdtTest(unittest.TestCase):
    def write(self, payload):
        td = tempfile.TemporaryDirectory()
        path = Path(td.name) / "tile.adt"
        path.write_bytes(payload)
        self.addCleanup(td.cleanup)
        return path

    def test_mtex_names_heights_layers_and_legacy_alpha(self):
        path = self.write(
            chunk("MTEX", b"Tileset\\A.blp\0Tileset\\B.blp\0") +
            chunk("MH2O", bytes(12 * 256)) +
            chunk("MDDF", bytes(36)) +
            chunk("MCNK", monolithic_mcnk())
        )
        parsed = adt2obj.read_monolithic_adt(path)
        self.assertEqual(parsed["textures"], ["Tileset\\A.blp", "Tileset\\B.blp"])
        self.assertEqual(parsed["m2_placements"], 1)
        self.assertIsNotNone(parsed["mh2o"])
        self.assertEqual(len(parsed["chunks"]), 1)
        c = parsed["chunks"][0]
        self.assertEqual((c["ix"], c["iy"], c["x0"], c["y0"], c["holes_lo"]),
                         (3, 4, 100.0, 200.0, 0x21))
        np.testing.assert_allclose(c["heights"][:3], [10.0, 11.0, 12.0])
        self.assertEqual([layer["tex"] for layer in c["layers"]], [0, 1])
        self.assertIsNone(c["alphas"][0])
        self.assertEqual(float(c["alphas"][1][0, 0]), 0.0)
        self.assertEqual(float(c["alphas"][1][0, 1]), 1.0)

    def test_malformed_header_offset_fails_clearly(self):
        path = self.write(chunk("MCNK", monolithic_mcnk(height_offset=999999)))
        with self.assertRaisesRegex(ValueError, "malformed MCNK MCVT offset"):
            adt2obj.read_monolithic_adt(path)

    def test_wmo_placements_are_refused(self):
        path = self.write(chunk("MODF", bytes(64)))
        with self.assertRaisesRegex(SystemExit, "WMO placement.*refusing to omit"):
            adt2obj.read_monolithic_adt(path)

    def test_texture_keys_are_case_and_separator_stable(self):
        self.assertEqual(adt2obj.legacy_texture_key("Tileset/A.blp"),
                         adt2obj.legacy_texture_key("tileset\\a.blp"))


if __name__ == "__main__":
    unittest.main()
