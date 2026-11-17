"""Compress a GLB for chronicle with gltfpack (meshopt + quantized geometry).

  .venv/bin/python -I tools/pack_glb.py <in.glb> [<in.glb> ...]

Writes <stem>-meshopt.glb beside each input; never overwrites. This is the file to publish:
the Replay Map's loader decodes EXT_meshopt_compression, and the geometry shrinks ~5x (Zul'Gurub
38.2 -> 22.8 MB, Wailing Caverns 12.3 -> 3.7 MB). Textures pass through untouched. Keep the raw
GLB: Blender's importer cannot read meshopt, so view_glb.py and the perspective proofs need it.

render_set.py --glb runs this on every GLB it exports. Run it by hand to repack an older
version folder's GLB before publishing it.

gltfpack comes from local.yaml `gltfpack` (default: `gltfpack` on PATH). Install the validated
version with `npm install -g gltfpack@1.3.0`, or use a release binary from
https://github.com/zeux/meshoptimizer/releases.
"""
import argparse
import json
import os
import shlex
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rmconfig  # noqa: E402

GLTFPACK_VALIDATED = "gltfpack 1.3"
MESHOPT = "EXT_meshopt_compression"
# -cc: meshopt compression at its higher level, plus gltfpack's default quantization.
# -kn: keep named nodes; the Replay Map finds water by its `liquid_*` node names.
# -km: keep materials unmerged; liquid tints apply per material.
# -ke: keep extras.
# -vp 16: 16-bit positions (default 14); the recipe validated by floor probes in #1429
# (median floor error < 0.005 yd). No simplification: the floor probes need the exact mesh.
FLAGS = ["-cc", "-kn", "-km", "-ke", "-vp", "16"]


def command():
    return shlex.split(str(rmconfig.CFG.get("gltfpack") or "gltfpack"))


def version(cmd=None):
    """gltfpack's version line, e.g. "gltfpack 1.3"."""
    cmd = cmd or command()
    try:
        r = subprocess.run([*cmd, "-v"], capture_output=True, text=True)
    except FileNotFoundError:
        raise SystemExit("gltfpack not found (%s). Install it: npm install -g gltfpack@1.3.0, "
                         "or set `gltfpack` in local.yaml" % " ".join(cmd))
    lines = (r.stdout + r.stderr).strip().splitlines()
    return lines[0].strip() if lines else ""


def extensions_used(path):
    """The GLB's extensionsUsed, read from its JSON chunk."""
    with open(path, "rb") as f:
        header = f.read(20)
        if len(header) < 20 or header[:4] != b"glTF":
            raise ValueError("%s is not a GLB" % path)
        length, kind = struct.unpack_from("<II", header, 12)
        if kind != 0x4E4F534A:  # "JSON"
            raise ValueError("%s: first chunk is not JSON" % path)
        return json.loads(f.read(length)).get("extensionsUsed", [])


def packed_path(src):
    root, _ = os.path.splitext(src)
    return root + "-meshopt.glb"


def pack(src, cmd=None):
    """Write packed_path(src) with gltfpack and check it decodes as meshopt; return its path."""
    cmd = cmd or command()
    dst = packed_path(src)
    if MESHOPT in extensions_used(src):
        raise SystemExit("%s is already meshopt-compressed" % src)
    if os.path.exists(dst):
        raise SystemExit("refusing to overwrite %s" % dst)
    r = subprocess.run([*cmd, "-i", src, "-o", dst, *FLAGS])
    if r.returncode != 0 or not os.path.exists(dst):
        raise SystemExit("gltfpack failed on %s" % src)
    if MESHOPT not in extensions_used(dst):
        os.remove(dst)
        raise SystemExit("gltfpack output for %s has no %s" % (src, MESHOPT))
    return dst


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("glb", nargs="+")
    a = p.parse_args(argv)
    cmd = command()
    v = version(cmd)
    if v != GLTFPACK_VALIDATED:
        print("warning: %s, validated on %s" % (v or "unknown gltfpack version", GLTFPACK_VALIDATED), file=sys.stderr)
    for src in a.glb:
        dst = pack(src, cmd)
        print("%s: %.1f -> %.1f MB" % (dst, os.path.getsize(src) / 1e6, os.path.getsize(dst) / 1e6), file=sys.stderr)


if __name__ == "__main__":
    main()
