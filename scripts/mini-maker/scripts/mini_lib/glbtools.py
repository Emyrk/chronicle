"""Minimal glTF-binary (.glb) reader and binary STL writer.

Standard-library only (struct + json). Used for two things Stage D needs
that gltf-transform's CLI doesn't do: reading a mesh's raw triangle count
(cheaply, from the STL header) and turning a decimated .glb into the .stl
`print.stl` wants — gltf-transform has no STL exporter.

Assumes a single mesh with a single indexed TRIANGLES primitive, which is
what Meshy and `gltf-transform simplify` both produce.
"""
from __future__ import annotations

import json
import struct

_COMPONENT_TYPES = {
    5121: ("B", 1),  # UNSIGNED_BYTE
    5123: ("H", 2),  # UNSIGNED_SHORT
    5125: ("I", 4),  # UNSIGNED_INT
    5126: ("f", 4),  # FLOAT
}
_TYPE_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def stl_facet_count(path):
    """Binary STL: 80-byte header, then a little-endian uint32 facet count."""
    with open(path, "rb") as f:
        header = f.read(84)
    if len(header) < 84:
        raise ValueError(f"{path}: too small to be a binary STL")
    return struct.unpack_from("<I", header, 80)[0]


def _read_glb_chunks(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError(f"{path}: not a .glb file")
    offset = 12
    json_chunk = None
    bin_chunk = None
    while offset < length:
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        chunk_data = data[offset + 8: offset + 8 + chunk_len]
        if chunk_type == 0x4E4F534A:  # 'JSON'
            json_chunk = chunk_data
        elif chunk_type == 0x004E4942:  # 'BIN\0'
            bin_chunk = chunk_data
        offset += 8 + chunk_len
    if json_chunk is None:
        raise ValueError(f"{path}: no JSON chunk")
    # glTF pads the JSON chunk with trailing spaces (some writers use NUL) to a
    # 4-byte boundary; strip that before decoding.
    return json.loads(json_chunk.rstrip(b" \x00")), bin_chunk


def _accessor_values(gltf, bin_chunk, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    comp_fmt, comp_size = _COMPONENT_TYPES[accessor["componentType"]]
    n = _TYPE_COUNTS[accessor["type"]]
    count = accessor["count"]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride") or comp_size * n
    fmt = "<" + comp_fmt * n
    values = []
    for i in range(count):
        off = base + i * stride
        values.append(struct.unpack_from(fmt, bin_chunk, off))
    return values


def read_triangles(path):
    """Return (positions, indices) for the first mesh primitive: positions is
    a list of (x, y, z) tuples, indices a flat list of ints, len(indices) % 3 == 0.
    """
    gltf, bin_chunk = _read_glb_chunks(path)
    if bin_chunk is None:
        raise ValueError(f"{path}: no BIN chunk (external buffers not supported)")
    mesh = gltf["meshes"][0]
    prim = mesh["primitives"][0]
    if prim.get("mode", 4) != 4:
        raise ValueError(f"{path}: primitive mode {prim.get('mode')} is not TRIANGLES")

    pos_accessor = prim["attributes"]["POSITION"]
    positions = [v for v in _accessor_values(gltf, bin_chunk, pos_accessor)]

    if "indices" in prim:
        idx_values = _accessor_values(gltf, bin_chunk, prim["indices"])
        indices = [v[0] for v in idx_values]
    else:
        indices = list(range(len(positions)))

    if len(indices) % 3 != 0:
        raise ValueError(f"{path}: index count {len(indices)} is not a multiple of 3")
    return positions, indices


def glb_face_count(path):
    _, indices = read_triangles(path)
    return len(indices) // 3


def read_mesh(path):
    """Like `read_triangles`, but also returns NORMAL: (positions, normals,
    indices). `normals` is None if the primitive has no NORMAL attribute.
    Used by the mini-005 crease-split pass, which needs to write a NORMAL
    accessor `read_triangles` was never asked to read."""
    gltf, bin_chunk = _read_glb_chunks(path)
    mesh = gltf["meshes"][0]
    prim = mesh["primitives"][0]
    if prim.get("mode", 4) != 4:
        raise ValueError(f"{path}: primitive mode {prim.get('mode')} is not TRIANGLES")

    positions = _accessor_values(gltf, bin_chunk, prim["attributes"]["POSITION"])
    normals = None
    if "NORMAL" in prim["attributes"]:
        normals = _accessor_values(gltf, bin_chunk, prim["attributes"]["NORMAL"])

    if "indices" in prim:
        indices = [v[0] for v in _accessor_values(gltf, bin_chunk, prim["indices"])]
    else:
        indices = list(range(len(positions)))
    if len(indices) % 3 != 0:
        raise ValueError(f"{path}: index count not a multiple of 3")
    return positions, normals, indices


def write_mesh(path, positions, indices, normals=None):
    """Write a plain, uncompressed glTF-binary: FLOAT VEC3 POSITION,
    optional FLOAT VEC3 NORMAL, UNSIGNED_INT SCALAR indices. One mesh, one
    primitive, one node, one scene — valid input for `gltf-transform`'s CLI
    (and for `rewrite_positions`/`meshopt_compress`, which read it back).
    Used by the mini-005 crease-split pass to hand its recomputed NORMAL
    accessor (and duplicated POSITION/indices) back into the pipeline before
    Meshopt compression.
    """
    pos_bytes = b"".join(struct.pack("<3f", *p) for p in positions)
    idx_bytes = b"".join(struct.pack("<I", i) for i in indices)

    buffer_views = []
    accessors = []

    pos_view = len(buffer_views)
    buffer_views.append({"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes)})
    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    zs = [p[2] for p in positions]
    accessors.append({
        "bufferView": pos_view, "componentType": 5126, "count": len(positions),
        "type": "VEC3", "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)],
    })
    pos_accessor_idx = len(accessors) - 1

    bin_parts = [pos_bytes]
    normal_accessor_idx = None
    if normals is not None:
        offset = len(b"".join(bin_parts))
        norm_bytes = b"".join(struct.pack("<3f", *n) for n in normals)
        norm_view = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(norm_bytes)})
        accessors.append({
            "bufferView": norm_view, "componentType": 5126, "count": len(normals), "type": "VEC3",
        })
        normal_accessor_idx = len(accessors) - 1
        bin_parts.append(norm_bytes)

    idx_offset = len(b"".join(bin_parts))
    idx_view = len(buffer_views)
    buffer_views.append({"buffer": 0, "byteOffset": idx_offset, "byteLength": len(idx_bytes)})
    accessors.append({
        "bufferView": idx_view, "componentType": 5125, "count": len(indices), "type": "SCALAR",
    })
    idx_accessor_idx = len(accessors) - 1
    bin_parts.append(idx_bytes)

    bin_chunk = b"".join(bin_parts)
    padded_len = len(bin_chunk) + ((4 - len(bin_chunk) % 4) % 4)

    attributes = {"POSITION": pos_accessor_idx}
    if normal_accessor_idx is not None:
        attributes["NORMAL"] = normal_accessor_idx

    gltf = {
        "asset": {"version": "2.0", "generator": "mini-maker Stage D (mini-005 crease pass)"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{
            "attributes": attributes, "indices": idx_accessor_idx, "mode": 4,
        }]}],
        "buffers": [{"byteLength": padded_len}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    _write_glb_chunks(path, gltf, bin_chunk)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _normalize(v):
    length = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5
    if length == 0:
        return (0.0, 0.0, 0.0)
    return (v[0] / length, v[1] / length, v[2] / length)


def write_binary_stl(path, positions, indices, header=b"mini-maker Stage D print export"):
    face_count = len(indices) // 3
    with open(path, "wb") as f:
        f.write(header.ljust(80, b"\0")[:80])
        f.write(struct.pack("<I", face_count))
        for t in range(face_count):
            i0, i1, i2 = indices[t * 3: t * 3 + 3]
            v0, v1, v2 = positions[i0], positions[i1], positions[i2]
            normal = _normalize(_cross(_sub(v1, v0), _sub(v2, v0)))
            f.write(struct.pack("<3f", *normal))
            f.write(struct.pack("<3f", *v0))
            f.write(struct.pack("<3f", *v1))
            f.write(struct.pack("<3f", *v2))
            f.write(struct.pack("<H", 0))


def glb_to_stl(glb_path, stl_path):
    positions, indices = read_triangles(glb_path)
    write_binary_stl(stl_path, positions, indices)
    return len(indices) // 3


def _write_glb_chunks(path, gltf, bin_bytes):
    json_bytes = json.dumps(gltf).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bytes(bin_bytes)
    bin_bytes += b"\x00" * ((4 - len(bin_bytes) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
        f.write(bin_bytes)


def read_node_transform(path):
    """The scene's single node TRS transform (translation, scale), as a
    `transform(x, y, z) -> (x, y, z)` function; identity if the glb has no
    nodes.

    `gltf-transform dequantize` represents the remap from a quantized
    KHR_mesh_quantization range back to the mesh's true bounding box as a
    node transform rather than baking it into the position accessor, so
    measuring true (post-Meshopt, post-dequantize) vertex positions means
    applying this too (mini-003; see `stage_d.dequantize_glb`). Raises if the
    node has a rotation or matrix, since Stage D's play tier never produces
    either (checked empirically: KHR_mesh_quantization's node remap is
    translate+scale only) and silently ignoring one would under-measure the
    base.
    """
    gltf, _ = _read_glb_chunks(path)
    nodes = gltf.get("nodes") or []
    if not nodes:
        return lambda x, y, z: (x, y, z)
    node = nodes[0]
    if "rotation" in node or "matrix" in node:
        raise ValueError(f"{path}: node rotation/matrix not supported by read_node_transform")
    tx, ty, tz = node.get("translation", (0.0, 0.0, 0.0))
    sx, sy, sz = node.get("scale", (1.0, 1.0, 1.0))

    def transform(x, y, z):
        return (x * sx + tx, y * sy + ty, z * sz + tz)

    return transform


def rewrite_positions(src_path, dst_path, transform):
    """Apply `transform(x, y, z) -> (x, y, z)` to every value of the first
    mesh primitive's POSITION accessor, in place and in order, and write the
    result to `dst_path`. Every other accessor (NORMAL, indices, ...) is
    copied unchanged. Recomputes the POSITION accessor's min/max.

    Used by Stage D's play-tier base-to-zero / footprint-normalise
    transform (see `footprint.py`), applied before Meshopt compression.
    """
    gltf, bin_chunk = _read_glb_chunks(src_path)
    mesh = gltf["meshes"][0]
    prim = mesh["primitives"][0]
    pos_accessor_idx = prim["attributes"]["POSITION"]
    accessor = gltf["accessors"][pos_accessor_idx]
    if accessor["componentType"] != 5126 or accessor["type"] != "VEC3":
        raise ValueError(f"{src_path}: POSITION accessor is not a FLOAT VEC3")
    view = gltf["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride") or 12
    count = accessor["count"]

    bin_bytes = bytearray(bin_chunk)
    new_min = [float("inf")] * 3
    new_max = [float("-inf")] * 3
    for i in range(count):
        off = base + i * stride
        x, y, z = struct.unpack_from("<3f", bin_bytes, off)
        nx, ny, nz = transform(x, y, z)
        struct.pack_into("<3f", bin_bytes, off, nx, ny, nz)
        for axis, v in enumerate((nx, ny, nz)):
            if v < new_min[axis]:
                new_min[axis] = v
            if v > new_max[axis]:
                new_max[axis] = v
    accessor["min"] = new_min
    accessor["max"] = new_max
    _write_glb_chunks(dst_path, gltf, bin_bytes)
