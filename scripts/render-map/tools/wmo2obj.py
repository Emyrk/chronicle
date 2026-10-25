"""Convert a modern (FileDataID-based) WMO root + group files into OBJ/MTL/PNG.

  python3 -I wmo2obj.py <dir>  --out <dir>/wc.obj
     <dir> must hold root.wmo, groups/group_NNN.wmo and textures/<fid>.blp
  python3 -I wmo2obj.py <dir> --list-textures   # print texture fids the root needs

Writes WoW coordinates unchanged (X, Y, Z-up). Skips collision-only and
material 0xFF faces. UV v is flipped for OBJ. Vertex colours (MOCV) are written
as the OBJ `v x y z r g b` extension so Blender can show baked lighting.
"""
import argparse
import os
import struct
import sys


def chunks(buf, start=0, end=None):
    end = len(buf) if end is None else end
    p = start
    while p + 8 <= end:
        tag = buf[p:p + 4][::-1].decode("ascii", "replace")
        size = struct.unpack_from("<I", buf, p + 4)[0]
        yield tag, p + 8, size
        p += 8 + size


def read_root(path):
    buf = open(path, "rb").read()
    motx = b""
    momt = []
    gfid = []
    ngroups = 0
    for tag, off, size in chunks(buf):
        if tag == "MOHD":
            ngroups = struct.unpack_from("<I", buf, off + 4)[0]
        elif tag == "MOTX":
            motx = buf[off:off + size]
        elif tag == "MOMT":
            for i in range(size // 64):
                flags, shader, blend, tex1 = struct.unpack_from("<4I", buf, off + i * 64)
                momt.append({"flags": flags, "shader": shader, "blend": blend, "tex1": tex1})
        elif tag == "GFID":
            gfid = list(struct.unpack_from("<%dI" % (size // 4), buf, off))
    for m in momt:
        if motx.strip(b"\0") and m["tex1"] < len(motx):
            m["texname"] = motx[m["tex1"]:motx.index(b"\0", m["tex1"])].decode("ascii", "replace")
        else:
            m["texfid"] = m["tex1"]
    if not gfid:  # 1.12-era root: no GFID, groups are <root>_NNN.wmo by name; count from MOHD
        gfid = [0] * ngroups
    return momt, gfid


def texkey(m):
    """File stem for a material's texture: the FileDataID, or the MOTX name flattened
    (dungeons\\textures\\floor\\x.blp -> dungeons__textures__floor__x)."""
    if "texfid" in m:
        return m["texfid"]
    n = m.get("texname", "").lower().replace("\\", "/")
    return n[:-4].replace("/", "__") if n.endswith(".blp") else n.replace("/", "__")


TILE = 533.3333 / 128  # 4.1666 units per liquid tile


def read_liquid(buf, o, s):
    """MLIQ -> list of quads (4 xyz tuples). Tiles whose flags & 0x0F == 0x0F are empty."""
    xv, yv, xt, yt = struct.unpack_from("<4I", buf, o)
    bx, by, bz = struct.unpack_from("<3f", buf, o + 16)
    vo = o + 30
    heights = [struct.unpack_from("<f", buf, vo + 8 * i + 4)[0] for i in range(xv * yv)]
    fo = vo + 8 * xv * yv
    quads = []
    for ty in range(yt):
        for tx in range(xt):
            if buf[fo + ty * xt + tx] & 0x0F == 0x0F:
                continue
            def pt(ix, iy):
                return (bx + ix * TILE, by + iy * TILE, heights[iy * xv + ix])  # heights are absolute
            quads.append((pt(tx, ty), pt(tx + 1, ty), pt(tx + 1, ty + 1), pt(tx, ty + 1)))
    return quads


def read_group(path):
    buf = open(path, "rb").read()
    out = {"verts": [], "uvs": [], "tris": [], "colors": None, "liquid": None}
    for tag, off, size in chunks(buf):
        if tag != "MOGP":
            continue
        hdr = 68
        mopy = movi = None
        for t, o, s in chunks(buf, off + hdr, off + size):
            if t == "MOPY":
                mopy = [(buf[o + 2 * i], buf[o + 2 * i + 1]) for i in range(s // 2)]
            elif t == "MPY2":  # 10.x+: u16 flags, u16 material (0xFFFF = none)
                u = struct.unpack_from("<%dH" % (s // 2), buf, o)
                mopy = [(u[2 * i], u[2 * i + 1]) for i in range(s // 4)]
            elif t == "MOVI":
                movi = struct.unpack_from("<%dH" % (s // 2), buf, o)
            elif t == "MOVT":
                f = struct.unpack_from("<%df" % (s // 4), buf, o)
                out["verts"] = [f[i:i + 3] for i in range(0, len(f), 3)]
            elif t == "MOTV" and not out["uvs"]:
                f = struct.unpack_from("<%df" % (s // 4), buf, o)
                out["uvs"] = [f[i:i + 2] for i in range(0, len(f), 2)]
            elif t == "MOCV" and out["colors"] is None:
                out["colors"] = [tuple(buf[o + 4 * i + k] for k in (2, 1, 0)) for i in range(s // 4)]
            elif t == "MLIQ":
                out["liquid"] = read_liquid(buf, o, s)
        if mopy and movi:
            for i, (flags, mat) in enumerate(mopy):
                if mat in (0xFF, 0xFFFF):
                    continue
                if (flags & 0x08) and not (flags & 0x20):  # collision-only, not rendered
                    continue
                out["tris"].append((mat, movi[3 * i], movi[3 * i + 1], movi[3 * i + 2]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out")
    ap.add_argument("--list-textures", action="store_true")
    a = ap.parse_args()
    momt, gfid = read_root(os.path.join(a.dir, "root.wmo"))
    if a.list_textures:
        for m in momt:
            if "texfid" in m and m["texfid"]:
                print(m["texfid"])
            elif m.get("texname"):
                print("name:" + m["texname"])
        return
    out = a.out or os.path.join(a.dir, "wmo.obj")
    base = os.path.splitext(os.path.basename(out))[0]
    outdir = os.path.dirname(os.path.abspath(out))
    pngdir = os.path.join(outdir, "textures")
    os.makedirs(pngdir, exist_ok=True)

    # textures -> png
    from PIL import Image
    texpng = {}
    for i, m in enumerate(momt):
        key = texkey(m)
        if not key:
            continue
        src = os.path.join(a.dir, "textures", "%s.blp" % key)
        dst = os.path.join(pngdir, "%s.png" % key)
        if os.path.exists(src) and not os.path.exists(dst):
            try:
                Image.open(src).convert("RGBA").save(dst)
            except Exception as e:  # noqa
                print("blp fail %s: %s" % (src, e), file=sys.stderr)
        if os.path.exists(dst):
            texpng[i] = os.path.relpath(dst, outdir)

    with open(os.path.join(outdir, base + ".mtl"), "w") as mtl:
        for i, m in enumerate(momt):
            mtl.write("newmtl mat_%d_b%d\nKd 1 1 1\nd 1\n" % (i, m["blend"]))
            if i in texpng:
                mtl.write("map_Kd %s\n" % texpng[i])
            mtl.write("\n")
        mtl.write("newmtl liquid\nKd 0.16 0.42 0.62\nd 0.85\n\n")

    ntri = 0
    nliq = 0
    vbase = 0
    tbase = 0
    with open(out, "w") as f:
        f.write("mtllib %s.mtl\n" % base)
        for gi in range(len(gfid)):
            gpath = os.path.join(a.dir, "groups", "group_%03d.wmo" % gi)
            if not os.path.exists(gpath):
                print("missing group %d" % gi, file=sys.stderr)
                continue
            g = read_group(gpath)
            if not g["tris"]:
                continue
            f.write("o group_%03d\n" % gi)
            cols = g["colors"] if g["colors"] and len(g["colors"]) == len(g["verts"]) else None
            for vi, (x, y, z) in enumerate(g["verts"]):
                if cols:
                    r, gg, b = cols[vi]
                    f.write("v %.4f %.4f %.4f %.4f %.4f %.4f\n" % (x, y, z, r / 255, gg / 255, b / 255))
                else:
                    f.write("v %.4f %.4f %.4f\n" % (x, y, z))
            for (u, v) in g["uvs"]:
                f.write("vt %.5f %.5f\n" % (u, 1 - v))
            has_uv = len(g["uvs"]) == len(g["verts"])
            cur = None
            for mat, i0, i1, i2 in sorted(g["tris"]):
                if mat != cur:
                    f.write("usemtl mat_%d_b%d\n" % (mat, momt[mat]["blend"] if mat < len(momt) else 0))
                    cur = mat
                a0, a1, a2 = i0 + vbase + 1, i1 + vbase + 1, i2 + vbase + 1
                if has_uv:
                    t0, t1, t2 = i0 + tbase + 1, i1 + tbase + 1, i2 + tbase + 1
                    f.write("f %d/%d %d/%d %d/%d\n" % (a0, t0, a1, t1, a2, t2))
                else:
                    f.write("f %d %d %d\n" % (a0, a1, a2))
                ntri += 1
            vbase += len(g["verts"])
            tbase += len(g["uvs"])
            if g["liquid"]:
                f.write("o liquid_%03d\nusemtl liquid\n" % gi)
                for q in g["liquid"]:
                    for (x, y, z) in q:
                        f.write("v %.4f %.4f %.4f\n" % (x, y, z))
                    f.write("f %d %d %d %d\n" % (vbase + 1, vbase + 2, vbase + 3, vbase + 4))
                    vbase += 4
                nliq += len(g["liquid"])
    print("wrote %s: %d groups, %d triangles, %d materials, %d textured, %d liquid tiles" % (out, len(gfid), ntri, len(momt), len(texpng), nliq), file=sys.stderr)


if __name__ == "__main__":
    main()
