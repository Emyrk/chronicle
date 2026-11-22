"""Blender-only offline GLB candidate extractor for the reviewed replay frame."""
import argparse
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mesh', required=True)
    parser.add_argument('--queries', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--metadata', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    blob = Path(args.mesh).read_bytes()
    magic, version, length = struct.unpack_from('<4sII', blob)
    if magic != b'glTF' or version != 2 or length != len(blob):
        raise ValueError('Expected complete GLB 2.0')
    size, tag = struct.unpack_from('<II', blob, 12)
    if tag != 0x4E4F534A:
        raise ValueError('Expected JSON first chunk')
    gltf = json.loads(blob[20:20 + size])
    offset = 20 + size
    size, tag = struct.unpack_from('<II', blob, offset)
    if tag != 0x004E4942 or offset + 8 + size != len(blob):
        raise ValueError('Expected one embedded BIN chunk')
    raw = memoryview(blob)[offset + 8:offset + 8 + size]
    if len(gltf.get('buffers', [])) != 1 or 'uri' in gltf['buffers'][0]:
        raise ValueError('External buffers are unsupported')
    # Replay clears translations of root children only. Reject every other transform.
    roots = gltf['scenes'][gltf.get('scene', 0)]['nodes']
    nodes = gltf.get('nodes', [])
    if set(roots) != set(range(len(nodes))):
        raise ValueError('Only flat root mesh nodes are supported; review a new adapter')
    for node in nodes:
        if ('matrix' in node or node.get('rotation', [0, 0, 0, 1]) != [0, 0, 0, 1]
                or node.get('scale', [1, 1, 1]) != [1, 1, 1] or node.get('children')
                or 'skin' in node):
            raise ValueError('Unsupported GLB transform or skin')

    def accessor(index):
        a = gltf['accessors'][index]
        if 'sparse' in a or a.get('normalized'):
            raise ValueError('Sparse/normalized accessors unsupported')
        view = gltf['bufferViews'][a['bufferView']]
        if view.get('buffer', 0) != 0:
            raise ValueError('Unexpected buffer index')
        dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']])
        components = {'SCALAR': 1, 'VEC3': 3}[a['type']]
        return np.ndarray((a['count'], components), dtype=dtype, buffer=raw,
                          offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(view.get('byteStride', components * dtype.itemsize), dtype.itemsize))

    vertices, triangles = [], []
    low = np.full(3, np.inf)
    high = np.full(3, -np.inf)
    for node in nodes:
        if 'mesh' not in node:
            continue
        # Same liquid classification as parsedDungeonMesh, not material names.
        liquid = node.get('name', '').startswith('liquid_')
        for primitive in gltf['meshes'][node['mesh']]['primitives']:
            if primitive.get('mode', 4) != 4 or primitive.get('targets') or primitive.get('extensions'):
                raise ValueError('Only uncompressed static indexed triangles supported')
            position = accessor(primitive['attributes']['POSITION'])
            # GLB XYZ -> raw WoW XYZ, undoing the mirrored horizontal axis.
            world = np.stack((-position[:, 0], position[:, 2], position[:, 1]), axis=1)
            if not np.isfinite(world).all():
                raise ValueError('Nonfinite vertex')
            low = np.minimum(low, world.min(axis=0))
            high = np.maximum(high, world.max(axis=0))
            ids = accessor(primitive['indices']).reshape(-1, 3).astype(np.int64)
            if np.any(ids < 0) or np.any(ids >= len(world)):
                raise ValueError('Invalid triangle index')
            normals = np.cross(world[ids[:, 1]] - world[ids[:, 0]], world[ids[:, 2]] - world[ids[:, 0]])
            up = normals[:, 2] / np.maximum(np.linalg.norm(normals, axis=1), 1e-20)
            keep = (np.abs(up) if liquid else up) >= math.cos(math.radians(50))
            base = len(vertices)
            vertices.extend(map(tuple, world))
            triangles.extend(tuple(int(i) + base for i in row) for row in ids[keep])
    if not triangles:
        raise ValueError('Mesh contains no walkable triangles')
    bvh = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    candidates = {}
    # Enumerate unique vertical levels by repeated probes. This offline adapter
    # merges surfaces closer than 0.00001 yd; it is not a BVH parity assertion.
    for query in json.loads(Path(args.queries).read_text()):
        heights = []
        top = float(high[2]) + 1
        for _ in range(4096):
            hit, _normal, _index, _distance = bvh.ray_cast(
                Vector((query['x'], query['y'], top)), Vector((0, 0, -1)),
                max(1, top - float(low[2]) + 1))
            if hit is None:
                break
            heights.append(float(hit.z))
            top = float(hit.z) - 0.00001
        else:
            raise ValueError('Too many overlapping surfaces')
        candidates[query['key']] = heights
    Path(args.out).write_text(json.dumps(candidates, allow_nan=False, separators=(',', ':')))
    metadata = dict(bounds=dict(minX=float(low[0]), maxX=float(high[0]), minY=float(low[1]), maxY=float(high[1])),
                    zMin=float(low[2]), zMax=float(high[2]), queries=len(candidates),
                    uncovered=sum(not heights for heights in candidates.values()),
                    ambiguous=sum(len(heights) > 1 for heights in candidates.values()),
                    walkableTriangles=len(triangles))
    Path(args.metadata).write_text(json.dumps(metadata, allow_nan=False, sort_keys=True))
    print('Candidate extraction:', len(candidates), 'queries;', metadata['uncovered'], 'uncovered')


if __name__ == '__main__':
    main()
