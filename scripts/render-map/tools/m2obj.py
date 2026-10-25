"""M2 doodads for adt2obj: fetch root + skin + textures for the file ids an ADT's MDDF places,
and read them into per-material triangle lists in M2-local space.

SPIKE (2026-10-14, Ruins of Lordaeron): geometry + diffuse texture 0 + alpha-key flag only.
Not handled: bones/animation (rest pose only), multi-texture shaders, two-sided flag, vertex
colours, particles/ribbons, LOD skin profiles beyond the first.

Layout (offsets relative to the MD20 header, i.e. 8 bytes into the MD21 chunk):
  60 vertices (count, off; 48 B: pos 3f, bone weights 4B, bone idx 4B, normal 3f, uv 2f, uv2 2f)
  80 textures (16 B: type, flags, M2Array name)   112 materials (4 B: flags u16, blend u16)
  128 texture_lookup (u16)
Skin file ('SKIN', offsets relative to the skin file): indices (u16 vertex lookup), triangles
(u16 into indices), bone_indices, submeshes (48 B), batches (24 B).
Chunks after MD21 in the root: SFID (skin file ids), TXID (texture file ids, by texture index).
"""
import os
import struct
import subprocess

import numpy as np


def chunks(buf):
    p = 0
    while p + 8 <= len(buf):
        tag = buf[p:p + 4].decode("ascii", "replace")
        size = struct.unpack_from("<I", buf, p + 4)[0]
        yield tag, p + 8, size
        p += 8 + size


def parse_root(path):
    buf = open(path, "rb").read()
    if buf[:4] != b"MD21":
        raise ValueError("%s: legacy M2 (no MD21 chunk)" % path)
    sfid, txid, md = [], [], None
    for tag, off, size in chunks(buf):
        if tag == "MD21":
            md = off
        elif tag == "SFID":
            sfid = list(struct.unpack_from("<%dI" % (size // 4), buf, off))
        elif tag == "TXID":
            txid = list(struct.unpack_from("<%dI" % (size // 4), buf, off))
    return buf, md, sfid, txid


def fetch(raw, cascget_bin, cache_params, fids, log=print):
    """Fetch roots, then first skin of each, then textures (as PNG). Idempotent. Returns fids that failed."""
    d = os.path.join(raw, "m2")
    os.makedirs(os.path.join(d, "textures"), exist_ok=True)

    def get(specs):
        specs = [s for s in specs if not os.path.exists(s.split("=", 1)[1])]
        for i in range(0, len(specs), 200):
            r = subprocess.run([cascget_bin, cache_params, *specs[i:i + 200]], capture_output=True, text=True)
            if r.returncode != 0:
                errs = [l for l in r.stderr.splitlines() if not l.startswith("[casc]")]
                raise SystemExit("cascget (m2) failed:\n" + "\n".join(errs[-10:]))

    root = lambda f: os.path.join(d, "%d.m2" % f)
    skin = lambda f: os.path.join(d, "%d.skin" % f)
    log("m2: %d models" % len(fids))
    get(["%d=%s" % (f, root(f)) for f in fids])
    sk, tx, bad = [], set(), []
    for f in fids:
        try:
            _, _, sfid, txid = parse_root(root(f))
        except (ValueError, FileNotFoundError) as e:
            bad.append(f)
            log("m2 %d: %s" % (f, e))
            continue
        if sfid:
            sk.append("%d=%s" % (sfid[0], skin(f)))
        tx.update(t for t in txid if t)
    get(sk)
    tpath = lambda t: os.path.join(d, "textures", "%d.blp" % t)
    get(["%d=%s" % (t, tpath(t)) for t in sorted(tx)])
    from PIL import Image
    for t in sorted(tx):
        png = tpath(t)[:-4] + ".png"
        if os.path.exists(tpath(t)) and not os.path.exists(png):
            Image.open(tpath(t)).convert("RGBA").save(png)
    return bad


def load(raw, fid):
    """-> {"parts": [{"verts": Nx3, "uvs": Nx2, "tris": [(a,b,c)], "tex": fid|None, "blend": int}]}
    or None when the model has no usable skin."""
    d = os.path.join(raw, "m2")
    rp, sp = os.path.join(d, "%d.m2" % fid), os.path.join(d, "%d.skin" % fid)
    if not (os.path.exists(rp) and os.path.exists(sp)):
        return None
    buf, md, _, txid = parse_root(rp)
    nv, ov = struct.unpack_from("<2I", buf, md + 60)
    ntex, otex = struct.unpack_from("<2I", buf, md + 80)
    nmat, omat = struct.unpack_from("<2I", buf, md + 112)
    nlk, olk = struct.unpack_from("<2I", buf, md + 128)
    V = np.frombuffer(buf, np.dtype([("p", "<f4", 3), ("w", "u1", 4), ("b", "u1", 4), ("n", "<f4", 3),
                                     ("uv", "<f4", 2), ("uv2", "<f4", 2)]), nv, md + ov)
    pos = V["p"].astype(np.float64)
    uv = V["uv"].astype(np.float64)
    types = [struct.unpack_from("<I", buf, md + otex + 16 * i)[0] for i in range(ntex)]
    lookup = struct.unpack_from("<%dH" % nlk, buf, md + olk)
    mats = [struct.unpack_from("<HH", buf, md + omat + 4 * i) for i in range(nmat)]

    s = open(sp, "rb").read()
    if s[:4] != b"SKIN":
        return None
    ni, oi, nt, ot, _nb, _ob, nsm, osm, nba, oba = struct.unpack_from("<10I", s, 4)
    idx = np.frombuffer(s, "<u2", ni, oi)
    tri = np.frombuffer(s, "<u2", nt, ot).reshape(-1, 3)
    subs = [struct.unpack_from("<10H", s, osm + 48 * i) for i in range(nsm)]  # id, level, vstart, vcount, istart, icount, ...
    parts = []
    for b in range(nba):
        (_fl, _pr, _sh, sec, _geo, _col, mi, _ml, ntx, tci) = struct.unpack_from("<2BH7H", s, oba + 24 * b)
        sm = subs[sec]
        t0 = sm[4] // 3
        t1 = t0 + sm[5] // 3
        tt = idx[tri[t0:t1]]
        texidx = lookup[tci] if tci < len(lookup) else None
        fidtex = None
        if texidx is not None and texidx < ntex and types[texidx] == 0 and texidx < len(txid):
            fidtex = txid[texidx] or None
        blend = mats[mi][1] if mi < len(mats) else 0
        used = np.unique(tt)
        remap = np.zeros(nv, np.int64)
        remap[used] = np.arange(len(used))
        parts.append({"verts": pos[used], "uvs": uv[used], "tris": [tuple(int(x) for x in r) for r in remap[tt]],
                      "tex": fidtex, "blend": int(blend)})
    return {"parts": parts}
