import json
import os
import struct
import sys
import tempfile
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib import glbtools


def _pad4(b):
    pad = (4 - len(b) % 4) % 4
    return b + b"\x00" * pad


def make_glb(path, positions, indices):
    """Build a minimal valid .glb: one mesh, one indexed TRIANGLES primitive,
    non-interleaved POSITION (float32 vec3) + indices (uint16), separate
    buffer views — same layout `--vertex-layout separate` produces."""
    pos_bytes = b"".join(struct.pack("<3f", *p) for p in positions)
    idx_bytes = b"".join(struct.pack("<H", i) for i in indices)
    pos_bytes_padded = _pad4(pos_bytes)
    idx_bytes_padded = _pad4(idx_bytes)
    bin_chunk = pos_bytes_padded + idx_bytes_padded

    xs = [p[0] for p in positions]; ys = [p[1] for p in positions]; zs = [p[2] for p in positions]
    gltf = {
        "asset": {"version": "2.0"},
        "scenes": [{"nodes": [0]}],
        "scene": 0,
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "mode": 4}]}],
        "buffers": [{"byteLength": len(bin_chunk)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes)},
            {"buffer": 0, "byteOffset": len(pos_bytes_padded), "byteLength": len(idx_bytes)},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": 1, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
        ],
    }
    json_bytes = _pad4(json.dumps(gltf).encode("utf-8"))

    with open(path, "wb") as f:
        total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_chunk)
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_chunk), 0x004E4942))
        f.write(bin_chunk)


def _make_glb_with_node(path, positions, indices, node):
    """Like `make_glb`, but with a caller-supplied node dict — for testing
    `read_node_transform` against the TRS gltf-transform inserts to remap
    KHR_mesh_quantization values back to the original bounding box."""
    pos_bytes = b"".join(struct.pack("<3f", *p) for p in positions)
    idx_bytes = b"".join(struct.pack("<H", i) for i in indices)
    pos_bytes_padded = _pad4(pos_bytes)
    idx_bytes_padded = _pad4(idx_bytes)
    bin_chunk = pos_bytes_padded + idx_bytes_padded

    xs = [p[0] for p in positions]; ys = [p[1] for p in positions]; zs = [p[2] for p in positions]
    gltf = {
        "asset": {"version": "2.0"},
        "scenes": [{"nodes": [0]}],
        "scene": 0,
        "nodes": [node],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "mode": 4}]}],
        "buffers": [{"byteLength": len(bin_chunk)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes)},
            {"buffer": 0, "byteOffset": len(pos_bytes_padded), "byteLength": len(idx_bytes)},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": 1, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
        ],
    }
    json_bytes = _pad4(json.dumps(gltf).encode("utf-8"))

    with open(path, "wb") as f:
        total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_chunk)
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_chunk), 0x004E4942))
        f.write(bin_chunk)


class ReadNodeTransformTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_no_nodes_is_identity(self):
        positions = [(0, 0, 0), (1, 0, 0), (1, 1, 0)]
        indices = [0, 1, 2]
        path = os.path.join(self.tmp, "no_nodes.glb")
        make_glb(path, positions, indices)  # has a node with no TRS keys

        transform = glbtools.read_node_transform(path)
        self.assertEqual(transform(1.0, 2.0, 3.0), (1.0, 2.0, 3.0))

    def test_translation_and_scale_are_applied(self):
        positions = [(0, 0, 0), (1, 0, 0), (1, 1, 0)]
        indices = [0, 1, 2]
        path = os.path.join(self.tmp, "trs.glb")
        node = {"mesh": 0, "translation": [1.0, 2.0, 3.0], "scale": [2.0, 2.0, 2.0]}
        _make_glb_with_node(path, positions, indices, node)

        transform = glbtools.read_node_transform(path)
        self.assertEqual(transform(1.0, 1.0, 1.0), (3.0, 4.0, 5.0))

    def test_rotation_raises(self):
        positions = [(0, 0, 0), (1, 0, 0), (1, 1, 0)]
        indices = [0, 1, 2]
        path = os.path.join(self.tmp, "rot.glb")
        node = {"mesh": 0, "rotation": [0.0, 0.0, 0.0, 1.0]}
        _make_glb_with_node(path, positions, indices, node)

        with self.assertRaises(ValueError):
            glbtools.read_node_transform(path)


class GlbRoundTripTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_read_triangles_two_triangle_quad(self):
        positions = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]
        indices = [0, 1, 2, 0, 2, 3]
        path = os.path.join(self.tmp, "quad.glb")
        make_glb(path, positions, indices)

        read_positions, read_indices = glbtools.read_triangles(path)
        self.assertEqual(len(read_positions), 4)
        self.assertEqual(read_indices, indices)
        self.assertEqual(glbtools.glb_face_count(path), 2)

    def test_glb_to_stl_facet_count_matches(self):
        positions = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]
        indices = [0, 1, 2, 0, 2, 3]
        glb_path = os.path.join(self.tmp, "quad.glb")
        stl_path = os.path.join(self.tmp, "quad.stl")
        make_glb(glb_path, positions, indices)

        faces = glbtools.glb_to_stl(glb_path, stl_path)
        self.assertEqual(faces, 2)
        self.assertEqual(glbtools.stl_facet_count(stl_path), 2)

    def test_rewrite_positions_transforms_positions_only(self):
        positions = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]
        indices = [0, 1, 2, 0, 2, 3]
        src = os.path.join(self.tmp, "quad.glb")
        dst = os.path.join(self.tmp, "quad_shifted.glb")
        make_glb(src, positions, indices)

        glbtools.rewrite_positions(src, dst, lambda x, y, z: (x + 10, y * 2, z - 1))

        new_positions, new_indices = glbtools.read_triangles(dst)
        self.assertEqual(new_indices, indices)
        self.assertEqual(
            [tuple(round(c, 6) for c in p) for p in new_positions],
            [(10.0, 0.0, -1.0), (11.0, 0.0, -1.0), (11.0, 2.0, -1.0), (10.0, 2.0, -1.0)],
        )

    def test_rewrite_positions_updates_accessor_min_max(self):
        positions = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]
        indices = [0, 1, 2, 0, 2, 3]
        src = os.path.join(self.tmp, "quad.glb")
        dst = os.path.join(self.tmp, "quad_shifted.glb")
        make_glb(src, positions, indices)

        glbtools.rewrite_positions(src, dst, lambda x, y, z: (x + 10, y * 2, z - 1))

        gltf, _ = glbtools._read_glb_chunks(dst)
        pos_accessor_idx = gltf["meshes"][0]["primitives"][0]["attributes"]["POSITION"]
        accessor = gltf["accessors"][pos_accessor_idx]
        self.assertEqual([round(v, 6) for v in accessor["min"]], [10.0, 0.0, -1.0])
        self.assertEqual([round(v, 6) for v in accessor["max"]], [11.0, 2.0, -1.0])

    def test_write_mesh_read_mesh_round_trip_with_normals(self):
        positions = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)]
        normals = [(0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0)]
        indices = [0, 1, 2]
        path = os.path.join(self.tmp, "tri_normals.glb")

        glbtools.write_mesh(path, positions, indices, normals=normals)
        read_positions, read_normals, read_indices = glbtools.read_mesh(path)

        self.assertEqual(read_positions, positions)
        self.assertEqual(read_normals, normals)
        self.assertEqual(read_indices, indices)
        # write_mesh's output is a plain accessor layout read_triangles
        # already understands (no NORMAL) — used by the rest of Stage D.
        self.assertEqual(glbtools.read_triangles(path), (positions, indices))

    def test_write_mesh_without_normals_round_trips_as_none(self):
        positions = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)]
        indices = [0, 1, 2]
        path = os.path.join(self.tmp, "tri_no_normals.glb")

        glbtools.write_mesh(path, positions, indices)
        _, read_normals, _ = glbtools.read_mesh(path)
        self.assertIsNone(read_normals)

    def test_rewrite_positions_preserves_an_existing_normal_accessor(self):
        positions = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)]
        normals = [(0.0, 0.0, 1.0), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0)]
        indices = [0, 1, 2]
        src = os.path.join(self.tmp, "tri_normals.glb")
        dst = os.path.join(self.tmp, "tri_normals_shifted.glb")
        glbtools.write_mesh(src, positions, indices, normals=normals)

        glbtools.rewrite_positions(src, dst, lambda x, y, z: (x + 10, y * 2, z - 1))

        _, read_normals, _ = glbtools.read_mesh(dst)
        self.assertEqual(read_normals, normals)

    def test_stl_normals_are_unit_length(self):
        import struct as st
        positions = [(0, 0, 0), (2, 0, 0), (0, 2, 0)]
        indices = [0, 1, 2]
        glb_path = os.path.join(self.tmp, "tri.glb")
        stl_path = os.path.join(self.tmp, "tri.stl")
        make_glb(glb_path, positions, indices)
        glbtools.glb_to_stl(glb_path, stl_path)

        with open(stl_path, "rb") as f:
            f.read(84)
            normal = st.unpack("<3f", f.read(12))
        length = sum(c * c for c in normal) ** 0.5
        self.assertAlmostEqual(length, 1.0, places=5)


if __name__ == "__main__":
    unittest.main()
