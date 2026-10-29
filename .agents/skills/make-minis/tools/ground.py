# usage: ground.py <in.glb> <out.glb> (relative paths resolve inside the configured workdir) — base to y=0, footprint centred, diameter 1 (stage_d's play-tier normalisation),
# applied as a parent node so the meshopt/quantized buffers stay byte-identical.
import sys, os, json, subprocess, tempfile
_MM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "scripts", "mini-maker")
sys.path.insert(0, os.path.join(_MM, "scripts"))
from mini_lib import config
config.enter()
from mini_lib import glbtools, footprint
src, dst = sys.argv[1], sys.argv[2]
tmp = tempfile.mktemp(suffix=".glb")
subprocess.run(["npx", "-y", "@gltf-transform/cli@4.5.0", "dequantize", src, tmp], check=True, capture_output=True)
pos, _ = glbtools.read_triangles(tmp); nt = glbtools.read_node_transform(tmp); os.remove(tmp)
world = [nt(*p) for p in pos]
fp = footprint.footprint(world, footprint.DEFAULT_SLICE_FRAC)
(x0, y0, z0), (x1, y1, z1) = footprint.bounds(world)
bbox_d = max(x1 - x0, z1 - z0)
s = 1.0 / fp["diameter"]
h = (y1 - y0) * s; w = bbox_d * s
print(f"{os.path.basename(src)}: fp_d={fp['diameter']:.3f} n={fp['n_points']} -> height={h:.2f} width={w:.2f}")
gltf, bin_chunk = glbtools._read_glb_chunks(src)
scene = gltf["scenes"][gltf.get("scene", 0)]
gltf["nodes"].append({"name": "grounded", "children": scene["nodes"],
    "scale": [s, s, s], "translation": [-fp["center_x"] * s, -fp["min_y"] * s, -fp["center_z"] * s]})
scene["nodes"] = [len(gltf["nodes"]) - 1]
glbtools._write_glb_chunks(dst, gltf, bin_chunk)
