"""Terrain (ADT) map -> OBJ for blender_topdown.py: heightmap mesh with baked ground textures,
water (MH2O) as liquid_* objects, and placed WMOs (obj0 MODF) as transformed group objects.
M2 doodads (trees, rocks, crates) are NOT included.

  .venv/bin/python -I tools/adt2obj.py <map-dir> --out <map-dir>/raw/obj/<slug>.obj [--chunk-px 128]

Needs (from fetch_map.py): raw/tiles.json, raw/adt/XX_YY_{root,tex0,obj0}.adt,
raw/terrain-textures/<fid>.png, raw/wmo/<fid>/{root.wmo,groups/,textures/}.
map.yaml `crop: {x: [min, max], y: [min, max]}` (world yards) limits chunks and placements.
`atlas_chunk_px` (--chunk-px) sets atlas px per chunk = 8 texture repeats; use 512 for a 4x render
(64 px per repeat, ~1 texel per output px at 12 px/yard). Atlases are cached per (tile, px, bake version).

Conventions established from the data (see README "terrain"):
  MCNK.position = (world x, world y, z) of the chunk's +x/+y corner; IndexX runs along -y,
  IndexY along -x; vertex row i along -x, column j along -y (UNIT = 533.33/128 yards).
  MODF position is in the file frame: world x = 17066.67 - pos.z, world y = 17066.67 - pos.x,
  world z = pos.y. Rotation: v' = Ry(ry + 180) . Rx(-rx) . Rz(-rz) in the file frame (found by
  exhaustive search against the MODF extents, 0.00 yd error); re-verified per placement, a
  mismatch aborts.
Output is in raw WoW world coordinates (z-up), like wmo2obj.py.
"""
import argparse
import json
import math
import os
import struct
import sys

import numpy as np
import yaml
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wmo2obj import read_group, read_root  # noqa: E402
import m2obj  # noqa: E402

TILE = 533.33333
CHUNK = TILE / 16
UNIT = CHUNK / 8
MAPC = 32 * TILE  # 17066.67


def chunks(buf, start=0, end=None):
    end = len(buf) if end is None else end
    p = start
    while p + 8 <= end:
        tag = buf[p:p + 4][::-1].decode("ascii", "replace")
        size = struct.unpack_from("<I", buf, p + 4)[0]
        yield tag, p + 8, size
        p += 8 + size


# ------------------------------------------------------------------ root ADT: heights, holes, water

def read_root_adt(path):
    buf = open(path, "rb").read()
    out = {"chunks": [], "mh2o": None}
    for tag, off, size in chunks(buf):
        if tag == "MH2O":
            out["mh2o"] = (buf, off, size)
        elif tag == "MCNK":
            flags, ix, iy = struct.unpack_from("<3I", buf, off)
            holes_hi = struct.unpack_from("<Q", buf, off + 0x14)[0]
            holes_lo = struct.unpack_from("<H", buf, off + 0x3C)[0]
            pos = struct.unpack_from("<3f", buf, off + 0x68)
            heights = None
            for t, o, s in chunks(buf, off + 128, off + size):
                if t == "MCVT":
                    heights = np.frombuffer(buf, "<f4", 145, o).astype(np.float64) + pos[2]
            out["chunks"].append({"ix": ix, "iy": iy, "x0": pos[0], "y0": pos[1],
                                  "holes_hi": holes_hi if flags & 0x10000 else None, "holes_lo": holes_lo,
                                  "heights": heights})
    return out


def quad_is_hole(c, i, j):
    if c["holes_hi"] is not None:
        return (c["holes_hi"] >> (i * 8 + j)) & 1
    return (c["holes_lo"] >> ((i // 2) * 4 + (j // 2))) & 1


def read_mh2o(buf, off, size, chunk_list):
    """-> list of (chunk index, [quads]) ; quad = 4 world xyz corners."""
    base = off
    out = []
    for ci in range(256):
        oi, nlayers, _oa = struct.unpack_from("<3I", buf, base + 12 * ci)
        if not nlayers:
            continue
        c = chunk_list[ci]
        quads = []
        for L in range(nlayers):
            o = base + oi + 24 * L
            ltype, lvf, minh, maxh, xoff, yoff, w, h, obits, overt = struct.unpack_from("<HHffBBBBII", buf, o)
            n = (w + 1) * (h + 1)
            heights = None
            if overt and not (abs(maxh - minh) < 1e-3):
                cand = np.frombuffer(buf, "<f4", n, base + overt).astype(np.float64)
                if np.all(np.isfinite(cand)) and cand.min() >= minh - 1 and cand.max() <= maxh + 1:
                    heights = cand
            if heights is None:
                heights = np.full(n, minh if abs(maxh - minh) < 1e-3 else (minh + maxh) / 2)
            bits = None
            if obits:
                nb = (w * h + 7) // 8
                bits = buf[base + obits: base + obits + nb]
            for cy in range(h):
                for cx in range(w):
                    k = cy * w + cx
                    if bits is not None and not (bits[k // 8] >> (k % 8)) & 1:
                        continue
                    r, col = yoff + cy, xoff + cx

                    def P(dr, dc):
                        return (c["x0"] - (r + dr) * UNIT, c["y0"] - (col + dc) * UNIT,
                                heights[(cy + dr) * (w + 1) + (cx + dc)])
                    quads.append((P(0, 0), P(1, 0), P(1, 1), P(0, 1)))  # counter-clockwise from +z
        if quads:
            out.append((ci, quads))
    return out


# ------------------------------------------------------------------ tex0 ADT: layers + alpha maps

def read_tex0_adt(path, big_alpha):
    buf = open(path, "rb").read()
    mdid = []
    per_chunk = []
    for tag, off, size in chunks(buf):
        if tag == "MDID":
            mdid = list(struct.unpack_from("<%dI" % (size // 4), buf, off))
        elif tag == "MCNK":
            start = off if buf[off:off + 4][::-1] == b"MCLY" else off + 128
            layers, mcal = [], b""
            for t, o, s in chunks(buf, start, off + size):
                if t == "MCLY":
                    for i in range(s // 16):
                        tex, flags, ofs, eff = struct.unpack_from("<4I", buf, o + 16 * i)
                        layers.append({"tex": tex, "flags": flags, "ofs": ofs})
                elif t == "MCAL":
                    mcal = buf[o:o + s]
            alphas = []
            for k, L in enumerate(layers):
                if k == 0:
                    alphas.append(None)
                    continue
                alphas.append(decode_alpha(mcal, L["ofs"], L["flags"], big_alpha))
            per_chunk.append({"layers": layers, "alphas": alphas})
    return mdid, per_chunk


def decode_alpha(mcal, ofs, flags, big_alpha):
    if flags & 0x200:  # RLE, 8-bit
        out = bytearray()
        p = ofs
        while len(out) < 4096 and p < len(mcal):
            cmd = mcal[p]
            p += 1
            cnt = cmd & 0x7F
            if cmd & 0x80:
                out += bytes([mcal[p]]) * cnt
                p += 1
            else:
                out += mcal[p:p + cnt]
                p += cnt
        a = np.frombuffer(bytes(out[:4096]).ljust(4096, b"\0"), np.uint8).reshape(64, 64)
    elif big_alpha:
        a = np.frombuffer(mcal, np.uint8, 4096, ofs).reshape(64, 64)
    else:
        raw = np.frombuffer(mcal, np.uint8, 2048, ofs)
        a = np.empty(4096, np.uint8)
        a[0::2] = (raw & 0x0F) * 17
        a[1::2] = (raw >> 4) * 17
        a = a.reshape(64, 64).copy()
        a[:, 63] = a[:, 62]
        a[63, :] = a[62, :]
    return a.astype(np.float32) / 255.0


# ------------------------------------------------------------------ obj0 ADT: WMO placements

def read_obj0_modf(path):
    buf = open(path, "rb").read()
    out = []
    for tag, off, size in chunks(buf):
        if tag == "MODF":
            for i in range(size // 64):
                o = off + 64 * i
                fid, uid = struct.unpack_from("<II", buf, o)
                pos = struct.unpack_from("<3f", buf, o + 8)
                rot = struct.unpack_from("<3f", buf, o + 20)
                bmin = struct.unpack_from("<3f", buf, o + 32)
                bmax = struct.unpack_from("<3f", buf, o + 44)
                flags, dset, nset, scale = struct.unpack_from("<4H", buf, o + 56)
                out.append({"fid": fid, "uid": uid, "pos": pos, "rot": rot, "bmin": bmin, "bmax": bmax,
                            "flags": flags, "scale": scale / 1024.0})
    return out


def read_obj0_mddf(path):
    """M2 doodad placements: 36 B each (fid, uid, pos 3f, rot 3f, scale u16/1024, flags u16).
    flags 0x40 = id is a FileDataID (every entry seen on Ruins of Lordaeron / Excavation Site)."""
    buf = open(path, "rb").read()
    out = []
    for tag, off, size in chunks(buf):
        if tag == "MDDF":
            for i in range(size // 36):
                fid, uid, *r, scale, flags = struct.unpack_from("<II6fHH", buf, off + 36 * i)
                if not flags & 0x40:
                    raise SystemExit("MDDF entry without file-id flag in %s: add MMDX/MMID lookup" % path)
                out.append({"fid": fid, "uid": uid, "pos": tuple(r[:3]), "rot": tuple(r[3:]), "scale": scale / 1024.0})
    return out


def place_m2_vertices(verts, pl, yaw_off_deg):
    """M2-local (x north, y west, z up; same axes as world) -> world, through the file frame like
    place_vertices(). The yaw offset is the unknown: WMO uses +180; M2 is fitted, see --m2-yaw."""
    V = np.asarray(verts, dtype=np.float64)
    local_file = np.stack([-V[:, 1], V[:, 2], -V[:, 0]], axis=1) * pl["scale"]
    rx, ry, rz = (math.radians(v) for v in pl["rot"])
    M = rot_y(ry + math.radians(yaw_off_deg)) @ rot_x(-rx) @ rot_z(-rz)
    F = local_file @ M.T + np.asarray(pl["pos"])
    return np.stack([MAPC - F[:, 2], MAPC - F[:, 0], F[:, 1]], axis=1)


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def placement_matrix(rot_deg):
    """MODF rotation -> file-frame matrix. Found by exhaustive search against the MODF extents of
    7 Excavation Site placements (3 with pitch/roll): max error 0.00 yd. Rotation components
    apply about the same-named file axes, order Z then X then Y, with yaw offset 180 degrees:
        v' = Ry(ry + 180) . Rx(-rx) . Rz(-rz) . v
    verify_convention() re-checks this for every placement; a mismatch aborts."""
    rx, ry, rz = (math.radians(v) for v in rot_deg)
    return rot_y(ry + math.pi) @ rot_x(-rx) @ rot_z(-rz)


def wmo_bbox(root_path):
    """MOHD bounding box (WMO-local), the box MODF extents are derived from."""
    buf = open(root_path, "rb").read()
    for tag, off, size in chunks(buf):
        if tag == "MOHD":
            return struct.unpack_from("<6f", buf, off + 36)
    raise SystemExit("no MOHD in " + root_path)


def place_vertices(verts, pl):
    """WMO-local (z-up) -> world (z-up) through the Y-up file frame."""
    V = np.asarray(verts, dtype=np.float64)
    local_file = np.stack([-V[:, 1], V[:, 2], -V[:, 0]], axis=1) * pl["scale"]
    M = placement_matrix(pl["rot"])
    F = local_file @ M.T + np.asarray(pl["pos"])
    return np.stack([MAPC - F[:, 2], MAPC - F[:, 0], F[:, 1]], axis=1), F


def verify_convention(bbox, pl):
    """Error (yards) between the placed MOHD box (axis-aligned in the file frame) and the MODF extents."""
    x0, y0, z0, x1, y1, z1 = bbox
    corners = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    _, F = place_vertices(corners, pl)
    return max(np.abs(F.min(0) - pl["bmin"]).max(), np.abs(F.max(0) - pl["bmax"]).max())


# ------------------------------------------------------------------ OBJ writer

class Obj:
    def __init__(self, path):
        self.f = open(path, "w")
        self.vbase = 0
        self.tbase = 0
        self.ntri = 0
        base = os.path.splitext(os.path.basename(path))[0]
        self.f.write("mtllib %s.mtl\n" % base)
        self.mtl = open(os.path.splitext(path)[0] + ".mtl", "w")
        self.mats = set()
        self.outdir = os.path.dirname(os.path.abspath(path))

    def material(self, name, png=None, kd=(1, 1, 1)):
        if name in self.mats:
            return
        self.mats.add(name)
        self.mtl.write("newmtl %s\nKd %.3f %.3f %.3f\nd 1\n" % ((name,) + tuple(kd)))
        if png:
            self.mtl.write("map_Kd %s\n" % os.path.relpath(png, self.outdir))
        self.mtl.write("\n")

    def mesh(self, name, verts, tris, uvs=None, material=None):
        """verts: Nx3, tris: list of (a,b,c[,mat]) ; uvs: Nx2 or None."""
        f = self.f
        f.write("o %s\n" % name)
        for v in verts:
            f.write("v %.4f %.4f %.4f\n" % (v[0], v[1], v[2]))
        if uvs is not None:
            for t in uvs:
                f.write("vt %.5f %.5f\n" % (t[0], t[1]))
        cur = None
        for tri in tris:
            m = tri[3] if len(tri) > 3 else material
            if m != cur:
                f.write("usemtl %s\n" % m)
                cur = m
            a, b, c = (i + self.vbase + 1 for i in tri[:3])
            if uvs is not None:
                ta, tb, tc = (i + self.tbase + 1 for i in tri[:3])
                f.write("f %d/%d %d/%d %d/%d\n" % (a, ta, b, tb, c, tc))
            else:
                f.write("f %d %d %d\n" % (a, b, c))
            self.ntri += 1
        self.vbase += len(verts)
        if uvs is not None:
            self.tbase += len(uvs)

    def quads(self, name, quads, material):
        f = self.f
        f.write("o %s\nusemtl %s\n" % (name, material))
        for q in quads:
            for (x, y, z) in q:
                f.write("v %.4f %.4f %.4f\n" % (x, y, z))
            b = self.vbase
            f.write("f %d %d %d %d\n" % (b + 1, b + 2, b + 3, b + 4))
            self.vbase += 4
            self.ntri += 2

    def close(self):
        self.f.close()
        self.mtl.close()


# ------------------------------------------------------------------ terrain tile

BAKE_VERSION = 2  # in the atlas filename: 1 = 1 texel in N, nearest; 2 = box-prefiltered to the sampled density, bilinear


def prefiltered(tex_dir, fid, s, tex_cache):
    """Ground texture `fid` as float RGB, box-filtered (area-averaged) down to s x s = the density the
    atlas samples it at. v1 picked 1 source texel in (1024/s) with no filtering, which turned a
    1024 px grass texture into speckle at 16 or 32 px per repeat; this is the mip level the game
    itself would sample."""
    key = (fid, s)
    tex = tex_cache.get(key)
    if tex is None:
        p = os.path.join(tex_dir, "%s.png" % fid)
        if os.path.exists(p):
            im = Image.open(p).convert("RGB")
            if (im.width, im.height) != (s, s):
                im = im.resize((s, s), Image.BOX)
            tex = np.asarray(im, np.float32) / 255.0
        else:
            tex = np.full((s, s, 3), 0.5, np.float32)
        tex_cache[key] = tex
    return tex


def sample_wrap(tex, g):
    """Bilinear sample of tex (h, w, 3) on the grid g (rows) x g (cols), g in repeat units [0, 1), wrapping."""
    h, w = tex.shape[:2]

    def axis(n):
        u = g * n - 0.5
        i0 = np.floor(u).astype(int)
        f = (u - i0).astype(np.float32)
        return i0 % n, (i0 + 1) % n, f

    r0, r1, fr = axis(h)
    c0, c1, fc = axis(w)
    fc = fc[None, :, None]
    top = tex[r0[:, None], c0[None, :]] * (1 - fc) + tex[r0[:, None], c1[None, :]] * fc
    bot = tex[r1[:, None], c0[None, :]] * (1 - fc) + tex[r1[:, None], c1[None, :]] * fc
    fr = fr[:, None, None]
    return top * (1 - fr) + bot * fr


def bake_tile(tex_dir, mdid, per_chunk, cp, tex_cache):
    """Return an RGB atlas (16*cp)^2 for the tile, chunks laid out [IndexY rows][IndexX cols].
    Textures repeat 8x per chunk, so each repeat gets cp/8 atlas px; every texture is prefiltered
    to that size first (see prefiltered), then bilinear-sampled. With cp a multiple of 8 the
    sample grid lands exactly on texel centres and the atlas is the box-filtered texture itself."""
    atlas = np.zeros((16 * cp, 16 * cp, 3), np.float32)
    # chunk-local sampling grid: 8 texture repeats per chunk along both axes
    g = (np.arange(cp) + 0.5) / cp * 8.0 % 1.0
    s = max(1, round(cp / 8))  # atlas px per texture repeat
    for k, ch in enumerate(per_chunk):
        ix, iy = k % 16, k // 16
        acc = None
        for li, L in enumerate(ch["layers"]):
            fid = mdid[L["tex"]] if L["tex"] < len(mdid) else None
            sample = sample_wrap(prefiltered(tex_dir, fid, s, tex_cache), g)
            if acc is None:
                acc = sample
            else:
                a = ch["alphas"][li]
                am = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((cp, cp), Image.BILINEAR),
                                np.float32) / 255.0
                acc = acc * (1 - am[:, :, None]) + sample * am[:, :, None]
        if acc is None:
            acc = np.full((cp, cp, 3), 0.4, np.float32)
        atlas[iy * cp:(iy + 1) * cp, ix * cp:(ix + 1) * cp] = acc
    return Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8))


def wmo_in_crop(pl, crop):
    """MODF extents (file frame) vs crop (world yards): world x = MAPC - file z, world y = MAPC - file x."""
    x0, x1 = MAPC - pl["bmax"][2], MAPC - pl["bmin"][2]
    y0, y1 = MAPC - pl["bmax"][0], MAPC - pl["bmin"][0]
    return not (x1 < crop["x"][0] or x0 > crop["x"][1] or y1 < crop["y"][0] or y0 > crop["y"][1])


def chunk_mesh(c, crop):
    """-> verts (145x3), uvs (145x2 in tile atlas space), tris."""
    if crop and (c["x0"] - CHUNK > crop["x"][1] or c["x0"] < crop["x"][0] or
                 c["y0"] - CHUNK > crop["y"][1] or c["y0"] < crop["y"][0]):
        return None
    h = c["heights"]
    verts = np.empty((145, 3))
    uvs = np.empty((145, 2))
    ix, iy = c["ix"], c["iy"]
    k = 0
    for i in range(9):
        for j in range(9):
            verts[k] = (c["x0"] - i * UNIT, c["y0"] - j * UNIT, h[k])
            uvs[k] = ((ix + j / 8) / 16, 1 - (iy + i / 8) / 16)
            k += 1
        if i < 8:
            for j in range(8):
                verts[k] = (c["x0"] - (i + .5) * UNIT, c["y0"] - (j + .5) * UNIT, h[k])
                uvs[k] = ((ix + (j + .5) / 8) / 16, 1 - (iy + (i + .5) / 8) / 16)
                k += 1
    tris = []
    for i in range(8):
        for j in range(8):
            if quad_is_hole(c, i, j):
                continue
            a, b = i * 17 + j, i * 17 + j + 1
            e, d = (i + 1) * 17 + j, (i + 1) * 17 + j + 1
            cc = i * 17 + 9 + j
            # counter-clockwise seen from +z (x north / y west)
            tris += [(a, cc, b), (b, cc, d), (d, cc, e), (e, cc, a)]
    return verts, uvs, tris


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("map_dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--chunk-px", type=int, default=128)
    ap.add_argument("--m2", action="store_true", help="also place M2 doodads (spike; needs raw/m2 from m2fetch)")
    ap.add_argument("--m2-yaw", type=float, default=180.0, help="yaw offset (deg) for M2 placements")
    a = ap.parse_args()
    mdir = a.map_dir
    cfg = yaml.safe_load(open(os.path.join(mdir, "map.yaml")))
    crop = cfg.get("crop")
    raw = os.path.join(mdir, "raw")
    tiles = json.load(open(os.path.join(raw, "tiles.json")))
    fetch = json.load(open(os.path.join(mdir, "fetch.json")))
    big_alpha = bool(fetch.get("mphd_flags", 0) & 0x84)  # 0x4 big alpha, 0x80 height texturing -> 8-bit maps
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    texdir = os.path.join(os.path.dirname(os.path.abspath(a.out)), "textures")
    os.makedirs(texdir, exist_ok=True)
    obj = Obj(a.out)
    obj.material("liquid", kd=(0.16, 0.42, 0.62))
    tex_cache = {}
    stats = {"tiles": 0, "chunks": 0, "water_quads": 0, "wmo_instances": 0, "wmo_skipped": [],
             "m2_instances": 0, "m2_skipped": set()}
    wmo_cache = {}
    m2_cache = {}
    # A WMO or doodad overlapping several tiles is listed in EVERY overlapping tile's obj0 with the same
    # uniqueId (Lordaeron's city WMO 114612, uid 65749827, is in 31_28 and 31_29); the client places it
    # once, so do we (before this, 114612 was meshed twice: 510k coincident triangles).
    placed_uids = {"wmo": set(), "m2": set()}
    stats["wmo_duplicate_uids"] = stats["m2_duplicate_uids"] = 0

    for t in tiles:
        tag = "%02d_%02d" % (t["x"], t["y"])
        rootp = os.path.join(raw, "adt", tag + "_root.adt")
        if not os.path.exists(rootp):
            continue  # outside the fetched crop
        root = read_root_adt(rootp)
        mdid, per_chunk = read_tex0_adt(os.path.join(raw, "adt", tag + "_tex0.adt"), big_alpha)
        # ground
        meshes = [chunk_mesh(c, crop) for c in root["chunks"]]
        if not any(m for m in meshes):
            continue
        atlas_png = os.path.join(texdir, "atlas_%s_%dpx_b%d.png" % (tag, a.chunk_px, BAKE_VERSION))
        if not os.path.exists(atlas_png):
            bake_tile(os.path.join(raw, "terrain-textures"), mdid, per_chunk, a.chunk_px, tex_cache).save(atlas_png)
        mat = "terrain_%s_b0" % tag
        obj.material(mat, atlas_png)
        V, T, F = [], [], []
        base = 0
        for m in meshes:
            if m is None:
                continue
            verts, uvs, tris = m
            V.append(verts)
            T.append(uvs)
            F += [(x + base, y + base, z + base) for (x, y, z) in tris]
            base += 145
            stats["chunks"] += 1
        obj.mesh("terrain_%s" % tag, np.vstack(V), F, np.vstack(T), mat)
        stats["tiles"] += 1
        # water
        if root["mh2o"]:
            quads = []
            for ci, qs in read_mh2o(*root["mh2o"], root["chunks"]):
                if meshes[ci] is None:
                    continue
                quads += qs
            if quads:
                obj.quads("liquid_%s" % tag, quads, "liquid")
                stats["water_quads"] += len(quads)
        # WMO placements
        for n, pl in enumerate(read_obj0_modf(os.path.join(raw, "adt", tag + "_obj0.adt"))):
            # keep a WMO whose MODF extents overlap the crop (not just its origin: the Lordaeron palace
            # dome's origin sits outside a walls-only crop while the dome itself is in the middle of it)
            if crop and not wmo_in_crop(pl, crop):
                continue
            if pl["uid"] in placed_uids["wmo"]:
                stats["wmo_duplicate_uids"] += 1
                continue
            placed_uids["wmo"].add(pl["uid"])
            wdir = os.path.join(raw, "wmo", str(pl["fid"]))
            if not os.path.exists(os.path.join(wdir, "root.wmo")):
                stats["wmo_skipped"].append(pl["fid"])
                continue
            if pl["fid"] not in wmo_cache:
                momt, gfids = read_root(os.path.join(wdir, "root.wmo"))
                groups = [read_group(os.path.join(wdir, "groups", "group_%03d.wmo" % gi))
                          if gfids[gi] else {"tris": [], "verts": []}  # GFID slot 0 = unused group
                          for gi in range(len(gfids))]
                wmo_cache[pl["fid"]] = (momt, groups)
                for mi, m in enumerate(momt):
                    key = m.get("texfid")
                    png = os.path.join(wdir, "obj", "textures", "%s.png" % key) if key else None
                    obj.material("wmo%d_mat_%d_b%d" % (pl["fid"], mi, m["blend"]), png if png and os.path.exists(png) else None)
            momt, groups = wmo_cache[pl["fid"]]
            err = verify_convention(wmo_bbox(os.path.join(wdir, "root.wmo")), pl)
            stats["max_placement_bbox_error_yd"] = max(stats.get("max_placement_bbox_error_yd", 0), round(float(err), 3))
            if err > 1.0:
                raise SystemExit("WMO %d placement does not reproduce its MODF extents (error %.1f yd); the rotation "
                                 "convention in placement_matrix() does not hold for this file: %s" % (pl["fid"], err, pl))
            for gi, g in enumerate(groups):
                if not g["tris"]:
                    continue
                W, _ = place_vertices(g["verts"], pl)
                uvs = np.asarray(g["uvs"]) if len(g["uvs"]) == len(g["verts"]) else None
                if uvs is not None:
                    uvs = np.stack([uvs[:, 0], 1 - uvs[:, 1]], axis=1)
                tris = [(i0, i1, i2, "wmo%d_mat_%d_b%d" % (pl["fid"], m, momt[m]["blend"] if m < len(momt) else 0))
                        for (m, i0, i1, i2) in sorted(g["tris"])]
                obj.mesh("wmo_%d_%s_%d_group_%03d" % (pl["fid"], tag, n, gi), W, tris, uvs)
                if g.get("liquid"):
                    lq = []
                    for q in g["liquid"]:
                        Wq, _ = place_vertices(list(q), pl)
                        lq.append([tuple(v) for v in Wq])
                    obj.quads("liquid_wmo_%d_%s_%d_%03d" % (pl["fid"], tag, n, gi), lq, "liquid")
            stats["wmo_instances"] += 1
        # M2 doodads (spike)
        if a.m2:
            for n, pl in enumerate(read_obj0_mddf(os.path.join(raw, "adt", tag + "_obj0.adt"))):
                wx, wy = MAPC - pl["pos"][2], MAPC - pl["pos"][0]
                if crop and not (crop["x"][0] <= wx <= crop["x"][1] and crop["y"][0] <= wy <= crop["y"][1]):
                    continue
                if pl["uid"] in placed_uids["m2"]:
                    stats["m2_duplicate_uids"] += 1
                    continue
                placed_uids["m2"].add(pl["uid"])
                if pl["fid"] not in m2_cache:
                    m2_cache[pl["fid"]] = m2obj.load(raw, pl["fid"])
                    for pi, part in enumerate(m2_cache[pl["fid"]]["parts"] if m2_cache[pl["fid"]] else []):
                        png = os.path.join(raw, "m2", "textures", "%d.png" % part["tex"]) if part["tex"] else None
                        obj.material("m2_%d_%d_b%d" % (pl["fid"], pi, min(part["blend"], 1)),
                                     png if png and os.path.exists(png) else None)
                m = m2_cache[pl["fid"]]
                if not m:
                    stats["m2_skipped"].add(pl["fid"])
                    continue
                for pi, part in enumerate(m["parts"]):
                    if not part["tris"] or part["blend"] >= 3:  # additive/mod blend: glow, fog, particles-as-cards
                        continue
                    W = place_m2_vertices(part["verts"], pl, a.m2_yaw)
                    uvs = np.asarray(part["uvs"])
                    uvs = np.stack([uvs[:, 0], 1 - uvs[:, 1]], axis=1)
                    mat = "m2_%d_%d_b%d" % (pl["fid"], pi, min(part["blend"], 1))
                    obj.mesh("m2_%d_%s_%d_%d" % (pl["fid"], tag, n, pi), W, part["tris"], uvs, mat)
                stats["m2_instances"] += 1
    obj.close()
    stats["triangles"] = obj.ntri
    stats["wmo_skipped"] = sorted(set(stats["wmo_skipped"]))
    stats["m2_skipped"] = sorted(stats["m2_skipped"])
    json.dump(stats, open(os.path.splitext(a.out)[0] + ".stats.json", "w"), indent=2)
    print("wrote %s: %s" % (a.out, json.dumps(stats)), file=sys.stderr)


if __name__ == "__main__":
    main()
