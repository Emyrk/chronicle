"""Fetch one map's global WMO (WDT -> root -> groups + textures) from the Blizzard CDN and
convert it to OBJ. No game client, no GUI. Idempotent: existing files are kept.

  .venv/bin/python -I tools/fetch_map.py <slug> [--force] [--allow-build-drift] [--refresh-wdt-index]

Reads maps/<slug>/map.yaml:
  directory   world/maps/<directory>/<directory>.wdt, resolved through data/wdt-index.csv
  wdt_fid     (optional) pins the WDT FileDataID directly; wins over `directory`
  product     CDN product, e.g. wow_classic_beta
  region      us | eu | ...
  build       pinned CDN build number; a different live build aborts unless --allow-build-drift
  allow_stale_placement_bounds
              placed-WMO only: allow a known-stale MODF bounding box while retaining its position/rotation;
              the mismatch and opt-in are recorded in fetch.json
Writes maps/<slug>/raw/: map.wdt, placements.json, root.wmo, group-ids.txt, groups/, textures/,
obj/<slug>.obj (+ .mtl + textures/*.png), and maps/<slug>/fetch.json (build, every FileDataID,
sha256 of every raw file) — committed provenance that render_set.py copies into each manifest,
and the way to verify a re-fetched raw/ is byte-identical to the one a render used.

Two map kinds, detected from the WDT and recorded in fetch.json as `kind`:
  wmo      — ONE global WMO placed at the origin, unrotated, scale 1 (every cave/building
             dungeon so far). Geometry + textures are fetched and converted to OBJ.
  terrain  — ADT tiles (outdoor-style instances, e.g. Excavation Site: Wetlands). The
             terrain's own look depends on hundreds of M2 doodads per tile (trees, rocks)
             that we do not render, so the pipeline fetches Blizzard's minimap tiles
             (512 px per 533.33-yard tile, with doodads, WMOs, water and shading baked in)
             and render_set.py stitches them. tiles.json lists every tile's file ids.
  wmo (placed) — a terrain WDT whose raid is ONE WMO placed in an ADT (Blackwing Lair: the tiles are
             outdoor dressing nobody walks on). map.yaml `placed_wmo:` names it (CDN: root FileDataID;
             MPQ: file name). The ADTs are read for its MODF only (exactly one uniqueID must match),
             the placement is checked against the MODF extents (adt2obj convention), and the OBJ is
             written in the frame of a global WMO (world with both horizontals negated), so every
             later step treats it like Molten Core.
Anything else (multi-WMO, rotated/translated placements, a WDT with neither) aborts with
the dump so the transform can be added deliberately, never guessed.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import struct
import subprocess
import sys
import urllib.request

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rmconfig  # noqa: E402
ROOT = rmconfig.workdir()  # maps/, cache/, data/ (local.yaml `workdir`)
CASC_DIR = os.path.join(ROOT, "cache", "casc")
CASCGET = os.path.join(CASC_DIR, "cascget")
CASCLIB_REPO = "https://github.com/ladislav-zezula/CascLib.git"
CASCLIB_COMMIT = open(os.path.join(HERE, "casc", "CASCLIB_COMMIT")).read().strip()
WDT_INDEX = os.path.join(ROOT, "data", "wdt-index.csv")
LISTFILE_URL = "https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv"


def log(msg):
    print("[fetch] " + msg, file=sys.stderr)


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sh(cmd, **kw):
    log("$ " + " ".join(cmd))
    return subprocess.run(cmd, check=True, **kw)


# ------------------------------------------------------------------ cascget

def ensure_cascget():
    """Build CascLib (pinned commit) + cascget once; recompile cascget when its source changes."""
    src_cpp = os.path.join(HERE, "casc", "cascget.cpp")
    stamp = CASCGET + ".src.sha256"
    if os.path.exists(CASCGET) and os.path.exists(stamp) and open(stamp).read().strip() == sha(src_cpp):
        return
    os.makedirs(CASC_DIR, exist_ok=True)
    src = os.path.join(CASC_DIR, "CascLib")
    if not os.path.exists(src):
        sh(["git", "clone", "-q", CASCLIB_REPO, src])
    sh(["git", "-C", src, "checkout", "-q", CASCLIB_COMMIT])
    # upstream typo on clang (LPDWORD); harmless on MSVC
    cf = os.path.join(src, "src", "CascFiles.cpp")
    txt = open(cf).read().replace("LPDWORD", "PDWORD")
    open(cf, "w").write(txt)
    build = os.path.join(CASC_DIR, "build")
    os.makedirs(build, exist_ok=True)
    if not os.path.exists(os.path.join(build, "libcasc.a")):
        sh(["cmake", "-DCMAKE_POLICY_VERSION_MINIMUM=3.5", "-DCMAKE_BUILD_TYPE=Release",
            "-DCASC_BUILD_STATIC_LIB=ON", "-DCASC_BUILD_SHARED_LIB=OFF", "-DCASC_BUILD_TEST_APP=OFF", src],
           cwd=build, stdout=subprocess.DEVNULL)
        sh(["make", "-j8"], cwd=build, stdout=subprocess.DEVNULL)
    sh(["clang++", "-std=c++11", "-O2", "-I", os.path.join(src, "src"), src_cpp,
        os.path.join(build, "libcasc.a"), "-lz", "-lbz2", "-o", CASCGET])
    open(stamp, "w").write(sha(src_cpp))


def cascget(product, region, specs):
    """specs: list of 'fid=outpath'. Returns the live build number."""
    cache = os.path.join(ROOT, "cache", "cdn", "%s-%s" % (product, region))
    os.makedirs(cache, exist_ok=True)
    params = "%s*%s*%s" % (cache, product, region)
    r = subprocess.run([CASCGET, params, *specs], capture_output=True, text=True)
    build = None
    for line in r.stderr.splitlines():
        m = re.search(r"product=(\S+) build=(\d+)", line)
        if m:
            build = int(m.group(2))
    if r.returncode != 0:
        errs = [l for l in r.stderr.splitlines() if not l.startswith("[casc]")]
        raise SystemExit("cascget failed:\n" + "\n".join(errs[-10:]))
    return build


# ------------------------------------------------------------------ WoW file parsing

def chunks(buf, start=0, end=None):
    end = len(buf) if end is None else end
    p = start
    while p + 8 <= end:
        tag = buf[p:p + 4][::-1].decode("ascii", "replace")
        size = struct.unpack_from("<I", buf, p + 4)[0]
        yield tag, p + 8, size
        p += 8 + size


def wdt_placements(path):
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
                out.append({"fileDataID": fid, "uniqueID": uid, "position": list(pos), "rotation": list(rot),
                            "bounds": {"minimum": list(bmin), "maximum": list(bmax)}, "flags": flags,
                            "doodadSet": dset, "nameSet": nset, "scale": scale / 1024.0})
    return out


def read_adt_modf_112(path):
    """1.12 monolithic ADT: MODF entries with their WMO name (MWID offset into MWMO); scale slot is padding."""
    buf = open(path, "rb").read()
    mwmo, mwid, out = b"", [], []
    for tag, off, size in chunks(buf):
        if tag == "MWMO":
            mwmo = buf[off:off + size]
        elif tag == "MWID":
            mwid = list(struct.unpack_from("<%dI" % (size // 4), buf, off))
        elif tag == "MODF":
            for i in range(size // 64):
                o = off + 64 * i
                nid, uid = struct.unpack_from("<II", buf, o)
                out.append({"nid": nid, "uid": uid, "pos": struct.unpack_from("<3f", buf, o + 8),
                            "rot": struct.unpack_from("<3f", buf, o + 20), "bmin": struct.unpack_from("<3f", buf, o + 32),
                            "bmax": struct.unpack_from("<3f", buf, o + 44), "scale": 1.0})
    for m in out:
        m["name"] = mwmo[mwid[m.pop("nid")]:].split(b"\0")[0].decode("ascii")
    return out


def one_placement(found, what):
    """The single placement (by uniqueID; neighbouring ADTs repeat a WMO that crosses their border)."""
    uids = {m["uid"]: m for m in found}
    if len(uids) != 1:
        raise SystemExit("placed_wmo %s: need exactly one placement, found %d: %s" % (what, len(uids), list(uids)))
    m = next(iter(uids.values()))
    return {"uniqueID": m["uid"], "position": list(m["pos"]), "rotation": list(m["rot"]),
            "bounds": {"minimum": list(m["bmin"]), "maximum": list(m["bmax"])}, "scale": m["scale"],
            "adts": sorted({m["adt"] for m in found})}


def validate_placement_extent(err, pl, allow_stale_bounds):
    """Require MODF extents to match unless map.yaml explicitly documents stale bounds."""
    if err <= 1.0:
        return True
    msg = "placed WMO does not reproduce its MODF extents (error %.1f yd): %s" % (err, pl)
    if not allow_stale_bounds:
        raise SystemExit(msg)
    log("WARNING: %s; continuing because map.yaml allows stale placement bounds" % msg)
    return False


def place_obj(obj, root, pl, allow_stale_bounds=False):
    """Move a WMO-local OBJ (wmo2obj) to where an ADT MODF places it: adt2obj.place_vertices gives true
    world coords, then both horizontals are negated (the frame a global WMO's own coordinates are in,
    which every WMO step after this assumes). Returns the extent error and whether the bounds verified."""
    import numpy as np
    sys.path.insert(0, HERE)
    import adt2obj
    p = {"pos": pl["position"], "rot": pl["rotation"], "bmin": pl["bounds"]["minimum"],
         "bmax": pl["bounds"]["maximum"], "scale": pl["scale"]}
    err = float(adt2obj.verify_convention(adt2obj.wmo_bbox(root), p))
    bounds_verified = validate_placement_extent(err, pl, allow_stale_bounds)
    lines = open(obj).read().split("\n")
    vi = [i for i, l in enumerate(lines) if l.startswith("v ")]
    V = np.array([[float(x) for x in lines[i].split()[1:4]] for i in vi])
    W, _ = adt2obj.place_vertices(V, p)
    for k, i in enumerate(vi):
        rest = lines[i].split()[4:]
        lines[i] = " ".join(["v %.4f %.4f %.4f" % (-W[k, 0], -W[k, 1], W[k, 2])] + rest)
    open(obj, "w").write("\n".join(lines))
    log("placed WMO: MODF uid %d at %s rot %s (extent error %.3f yd, bounds verified: %s)" %
        (pl["uniqueID"], pl["position"], pl["rotation"], err, bounds_verified))
    return err, bounds_verified


def wdt_mphd_flags(path):
    buf = open(path, "rb").read()
    for tag, off, size in chunks(buf):
        if tag == "MPHD":
            return struct.unpack_from("<I", buf, off)[0]
    return 0


def tile_world_bounds(tx, ty):
    """world x/y range of tile (tx, ty): x = (32 - ty) * TILE downwards, y = (32 - tx) * TILE downwards."""
    T = 533.33333
    return ((32 - ty - 1) * T, (32 - ty) * T), ((32 - tx - 1) * T, (32 - tx) * T)


def tile_in_crop(t, crop):
    if not crop:
        return True
    (x0, x1), (y0, y1) = tile_world_bounds(t["x"], t["y"])
    return not (x1 < crop["x"][0] or x0 > crop["x"][1] or y1 < crop["y"][0] or y0 > crop["y"][1])


def wdt_tiles(path):
    """ADT tiles present (MAIN flag bit 0) with their MAID file ids."""
    buf = open(path, "rb").read()
    present, maid = [], None
    for tag, off, size in chunks(buf):
        if tag == "MAIN":
            for i in range(64 * 64):
                if struct.unpack_from("<I", buf, off + 8 * i)[0] & 1:
                    present.append((i % 64, i // 64))
        elif tag == "MAID":
            maid = off
    tiles = []
    for x, y in present:
        t = {"x": x, "y": y}
        if maid is not None:
            f = struct.unpack_from("<8I", buf, maid + 32 * (y * 64 + x))
            t.update(dict(zip(("root", "obj0", "obj1", "tex0", "lod", "maptex", "maptexN", "minimap"), f)))
        tiles.append(t)
    return tiles


def wmo_group_fids(path):
    buf = open(path, "rb").read()
    for tag, off, size in chunks(buf):
        if tag == "GFID":
            return list(struct.unpack_from("<%dI" % (size // 4), buf, off))
    return []


def resolve_wdt_fid(cfg):
    if cfg.get("wdt_fid"):
        return int(cfg["wdt_fid"]), "map.yaml wdt_fid"
    want = "world/maps/%s/%s.wdt" % (cfg["directory"], cfg["directory"])
    if not os.path.exists(WDT_INDEX):
        log("no %s yet (fresh workdir): building it" % WDT_INDEX)
        refresh_wdt_index()
    for line in open(WDT_INDEX):
        fid, path = line.strip().split(";", 1)
        if path.lower() == want.lower():
            return int(fid), "data/wdt-index.csv (%s)" % path
    raise SystemExit("no %s in %s — try --refresh-wdt-index, or set wdt_fid in map.yaml" % (want, WDT_INDEX))


def refresh_wdt_index():
    log("downloading " + LISTFILE_URL)
    tmp = os.path.join(ROOT, "cache", "community-listfile.csv")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    urllib.request.urlretrieve(LISTFILE_URL, tmp)
    rows = sorted(l for l in open(tmp, errors="replace")
                  if re.match(r"^\d+;world/maps/[^/]+/[^/]+\.wdt$", l.strip(), re.I))
    os.makedirs(os.path.dirname(WDT_INDEX), exist_ok=True)
    open(WDT_INDEX, "w").writelines(rows)
    log("wdt-index.csv: %d rows (listfile sha256 %s)" % (len(rows), sha(tmp)))


def blp_to_png(blp, png, mode):
    """Convert a BLP with Pillow, including BLP2 raw BGRA (encoding 3), which Pillow 13 rejects."""
    from PIL import Image
    try:
        Image.open(blp).convert(mode).save(png)
        return
    except NotImplementedError as err:
        buf = open(blp, "rb").read()
        if buf[:4] != b"BLP2" or len(buf) < 148 or buf[8] != 3:
            raise err
        width, height = struct.unpack_from("<II", buf, 12)
        offset = struct.unpack_from("<I", buf, 20)[0]
        length = struct.unpack_from("<I", buf, 84)[0]
        if length != width * height * 4 or offset + length > len(buf):
            raise SystemExit("invalid BLP2 raw BGRA mip in %s" % blp)
        Image.frombytes("RGBA", (width, height), buf[offset:offset + length], "raw", "BGRA").convert(mode).save(png)


# ------------------------------------------------------------------ terrain (minimap tiles)

def fetch_terrain(a, cfg, mdir, raw, product, region, build, wdt_fid, how, tiles, need):
    from PIL import Image
    json.dump(tiles, open(os.path.join(raw, "tiles.json"), "w"), indent=1)
    use_minimap = cfg.get("minimap", True)
    sizes = set()
    if use_minimap:
        missing = [t for t in tiles if not t.get("minimap")]
        if missing:
            raise SystemExit("%d tiles have no minimap texture id (MAID); set map.yaml `minimap: false` "
                             "to render without a Blizzard alignment reference" % len(missing))
        mm = os.path.join(raw, "minimap")
        os.makedirs(mm, exist_ok=True)
        specs = []
        for t in tiles:
            p = os.path.join(mm, "%02d_%02d.blp" % (t["x"], t["y"]))
            if need(p):
                specs.append("%d=%s" % (t["minimap"], p))
        if specs:
            log("fetching %d minimap tiles" % len(specs))
            cascget(product, region, specs)
        for t in tiles:
            blp = os.path.join(mm, "%02d_%02d.blp" % (t["x"], t["y"]))
            png = blp[:-4] + ".png"
            if need(png):
                blp_to_png(blp, png, "RGBA")
            sizes.add(Image.open(png).size)
        if len(sizes) != 1:
            raise SystemExit("minimap tiles differ in size: %s" % sorted(sizes))
    else:
        log("minimap disabled by map.yaml; render will have no Blizzard alignment reference")
    # ---- geometry for the Cycles render: ADTs of the tiles in the crop, their ground textures, placed WMOs
    crop = cfg.get("crop")
    sel = [t for t in tiles if tile_in_crop(t, crop)]
    adt = os.path.join(raw, "adt")
    os.makedirs(adt, exist_ok=True)
    specs = []
    for t in sel:
        for kind in ("root", "tex0", "obj0"):
            p = os.path.join(adt, "%02d_%02d_%s.adt" % (t["x"], t["y"], kind))
            if need(p):
                specs.append("%d=%s" % (t[kind], p))
    if specs:
        log("fetching %d ADT files for %d tiles in crop" % (len(specs), len(sel)))
        cascget(product, region, specs)
    sys.path.insert(0, HERE)
    import adt2obj  # noqa: E402
    tex_fids, wmo_fids = set(), set()
    for t in sel:
        tag = "%02d_%02d" % (t["x"], t["y"])
        buf = open(os.path.join(adt, tag + "_tex0.adt"), "rb").read()
        for ctag, off, size in chunks(buf):
            if ctag == "MDID":
                tex_fids.update(struct.unpack_from("<%dI" % (size // 4), buf, off))
        for pl in adt2obj.read_obj0_modf(os.path.join(adt, tag + "_obj0.adt")):
            if pl["flags"] & 0x8:
                wmo_fids.add(pl["fid"])
            else:
                raise SystemExit("obj0 MODF without file-id flag (names via MWMO) in %s: add MWID/MWMO lookup" % tag)
    ttex = os.path.join(raw, "terrain-textures")
    os.makedirs(ttex, exist_ok=True)
    specs = ["%d=%s" % (f, os.path.join(ttex, "%d.blp" % f)) for f in sorted(tex_fids)
             if need(os.path.join(ttex, "%d.blp" % f))]
    if specs:
        log("fetching %d ground textures" % len(specs))
        cascget(product, region, specs)
    for f in sorted(tex_fids):
        blp = os.path.join(ttex, "%d.blp" % f)
        if need(blp[:-4] + ".png"):
            blp_to_png(blp, blp[:-4] + ".png", "RGB")
    for f in sorted(wmo_fids):
        wdir = os.path.join(raw, "wmo", str(f))
        os.makedirs(os.path.join(wdir, "groups"), exist_ok=True)
        os.makedirs(os.path.join(wdir, "textures"), exist_ok=True)
        root = os.path.join(wdir, "root.wmo")
        if need(root):
            cascget(product, region, ["%d=%s" % (f, root)])
        gf = wmo_group_fids(root)
        specs = ["%d=%s" % (g, os.path.join(wdir, "groups", "group_%03d.wmo" % i)) for i, g in enumerate(gf)
                 if g and need(os.path.join(wdir, "groups", "group_%03d.wmo" % i))]
        tex = subprocess.run([sys.executable, "-I", os.path.join(HERE, "wmo2obj.py"), wdir, "--list-textures"],
                             capture_output=True, text=True, check=True).stdout.split()
        specs += ["%s=%s" % (t, os.path.join(wdir, "textures", "%s.blp" % t)) for t in sorted({t for t in tex if t.isdigit()})
                  if need(os.path.join(wdir, "textures", "%s.blp" % t))]
        if specs:
            log("WMO %d: fetching %d groups/textures" % (f, len(specs)))
            cascget(product, region, specs)
        if need(os.path.join(wdir, "obj", "w.obj")):  # also converts its BLPs to obj/textures/*.png
            sh([sys.executable, "-I", os.path.join(HERE, "wmo2obj.py"), wdir, "--out", os.path.join(wdir, "obj", "w.obj")],
               stderr=subprocess.DEVNULL)
    xs = [t["x"] for t in tiles]
    ys = [t["y"] for t in tiles]
    files = {}
    for dp, _, fns in os.walk(raw):
        for fn in fns:
            p = os.path.join(dp, fn)
            files[os.path.relpath(p, raw)] = sha(p)
    prov = {
        "slug": a.slug, "kind": "terrain",
        "fetched": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "product": product, "region": region, "build": build, "wdt_fid": wdt_fid, "wdt_resolved_via": how,
        "root_fid": None, "casclib_commit": CASCLIB_COMMIT,
        "tiles": tiles, "minimap": use_minimap,
        "tile_px": sorted(sizes)[0][0] if sizes else None, "tile_yards": 533.33333,
        "tile_range": {"x": [min(xs), max(xs)], "y": [min(ys), max(ys)]},
        "mphd_flags": wdt_mphd_flags(os.path.join(raw, "map.wdt")),
        "crop": crop, "crop_tiles": [[t["x"], t["y"]] for t in sel],
        "terrain_texture_fids": sorted(tex_fids), "wmo_fids": sorted(wmo_fids),
        "files": files,
    }
    json.dump(prov, open(os.path.join(mdir, "fetch.json"), "w"), indent=2)
    # ---- OBJ for Blender (needs fetch.json for mphd flags)
    obj = os.path.join(raw, "obj", "%s.obj" % a.slug)
    sh([sys.executable, "-I", os.path.join(HERE, "adt2obj.py"), mdir, "--out", obj,
        "--chunk-px", str(cfg.get("atlas_chunk_px", 128))])
    prov["obj"] = os.path.relpath(obj, raw)
    prov["adt_stats"] = json.load(open(os.path.splitext(obj)[0] + ".stats.json"))
    for dp, _, fns in os.walk(os.path.join(raw, "obj")):
        for fn in fns:
            p = os.path.join(dp, fn)
            prov["files"][os.path.relpath(p, raw)] = sha(p)
    json.dump(prov, open(os.path.join(mdir, "fetch.json"), "w"), indent=2)
    minimap_summary = "%dpx" % prov["tile_px"] if prov["tile_px"] else "no minimap"
    log("done: terrain, %d tiles (%s; crop: %d tiles), %s" % (len(tiles), minimap_summary, len(sel),
                                                              json.dumps(prov["adt_stats"])))


# ------------------------------------------------------------------ 1.12 MPQ client (WMO maps only)

def fetch_mpq_wmo(a, cfg, mdir, raw, need):
    """map.yaml `source: mpq`, `client: <dir with Data/>`: same raw/ layout as a CDN fetch, files by
    NAME from the client's archive chain (tools/mpq_chain.py, read-only). WMO maps only: 1.12 WDT
    has MWMO (names) instead of FileDataIDs, roots have MOTX names and no GFID (groups are
    <root>_NNN.wmo, count from MOHD), groups MOPY. Terrain (monolithic ADT, MCLQ) is not built."""
    sys.path.insert(0, HERE)
    import mpq_chain
    import wmo2obj
    chain = mpq_chain.Chain(cfg["client"])
    got = {}  # raw-relative path -> {name, archive}

    def get(name, rel):
        p = os.path.join(raw, rel)
        if need(p):
            w = chain.get(name, p)
        else:
            w = chain.winner(name)
        if not w:
            raise SystemExit("%s not in %s" % (name, chain.data))
        got[rel] = {"name": w[2], "archive": w[0], "archives": [h[0] for h in chain.files[name.lower()]]}
        return p

    d = cfg["directory"]
    wdt = get("World\\Maps\\%s\\%s.wdt" % (d, d), "map.wdt")
    buf = open(wdt, "rb").read()
    mwmo = next((buf[o:o + s].split(b"\0")[0].decode("ascii") for t, o, s in chunks(buf) if t == "MWMO"), "")
    pl = wdt_placements(wdt)
    for p_ in pl:  # 1.12 MODF: first field is an MWMO name index, the scale slot is padding (0)
        p_["nameIndex"] = p_.pop("fileDataID")
        p_["scale"] = p_["scale"] or 1.0
        p_["name"] = mwmo
    placed = None
    if not pl and cfg.get("placed_wmo"):
        want = cfg["placed_wmo"].lower().replace("/", "\\")
        found = []
        for t in wdt_tiles(wdt):
            tag = "%02d_%02d" % (t["x"], t["y"])
            ap = get("World\\Maps\\%s\\%s_%d_%d.adt" % (d, d, t["x"], t["y"]), os.path.join("adt", tag + ".adt"))
            found += [dict(m, adt=tag) for m in read_adt_modf_112(ap) if m["name"].lower() == want]
        placed = one_placement(found, want)
        mwmo = cfg["placed_wmo"]
        pl = [dict(placed, name=mwmo)]
    json.dump(pl, open(os.path.join(raw, "placements.json"), "w"), indent=2)
    if placed:
        pass
    elif not mwmo or len(pl) != 1 or any(pl[0]["position"]) or any(pl[0]["rotation"]) or abs(pl[0]["scale"] - 1) > 1e-6:
        raise SystemExit("unsupported 1.12 world shape (need one origin-placed WMO; terrain is not built "
                         "for the MPQ source):\n" + json.dumps(pl, indent=2))
    root = get(mwmo, "root.wmo")
    momt, gslots = wmo2obj.read_root(root)
    stem = mwmo[:-4]
    groups = [stem + "_%03d.wmo" % i for i in range(len(gslots))]
    for i, g in enumerate(groups):
        get(g, os.path.join("groups", "group_%03d.wmo" % i))
    texnames = sorted({m["texname"] for m in momt if m.get("texname")})
    missing = []
    for t in texnames:
        if chain.winner(t):
            get(t, os.path.join("textures", "%s.blp" % wmo2obj.texkey({"texname": t})))
        else:
            missing.append(t)
    log("MPQ %s: %s, %d groups, %d textures (%d missing: %s)" % (chain.data, mwmo, len(groups), len(texnames),
                                                                len(missing), missing[:3]))
    obj = os.path.join(raw, "obj", "%s.obj" % a.slug)
    sh([sys.executable, "-I", os.path.join(HERE, "wmo2obj.py"), raw, "--out", obj])
    if placed:
        err, verified = place_obj(obj, root, placed, bool(cfg.get("allow_stale_placement_bounds")))
        pl[0]["extent_error_yd"] = round(err, 3)
        pl[0]["bounds_verified"] = verified
        if not verified:
            pl[0]["stale_bounds_allowed"] = True
    files = {}
    for dp, _, fns in os.walk(raw):
        for fn in fns:
            p = os.path.join(dp, fn)
            files[os.path.relpath(p, raw)] = sha(p)
    prov = {
        "slug": a.slug, "kind": "wmo", "source": "mpq",
        "fetched": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "product": None, "region": None, "build": None, "wdt_fid": None, "root_fid": None,
        "client": cfg["client"], "stormlib_commit": mpq_chain.STORMLIB_COMMIT,
        "archives": [{"name": os.path.basename(x), "bytes": os.path.getsize(x),
                      "mtime": int(os.path.getmtime(x))} for x in chain.archives],
        "root": mwmo, "groups": groups, "textures": texnames, "textures_missing": missing,
        "mpq_files": got, "placement": pl[0], "placed_wmo": bool(placed), "obj": os.path.relpath(obj, raw),
        "files": files,
    }
    json.dump(prov, open(os.path.join(mdir, "fetch.json"), "w"), indent=2)
    log("done: %s (%d files hashed)" % (os.path.relpath(obj, ROOT), len(files)))


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?")
    ap.add_argument("--force", action="store_true", help="re-download everything")
    ap.add_argument("--allow-build-drift", action="store_true")
    ap.add_argument("--refresh-wdt-index", action="store_true")
    a = ap.parse_args()
    if a.refresh_wdt_index:
        refresh_wdt_index()
        if not a.slug:
            return
    if not a.slug:
        ap.error("slug required")

    mdir = os.path.join(ROOT, "maps", a.slug)
    cfg = yaml.safe_load(open(os.path.join(mdir, "map.yaml")))
    raw = os.path.join(mdir, "raw")
    for d in ("groups", "textures", "obj"):
        os.makedirs(os.path.join(raw, d), exist_ok=True)

    def need(path):
        return a.force or not os.path.exists(path)

    if cfg.get("source") == "mpq":
        return fetch_mpq_wmo(a, cfg, mdir, raw, need)
    product, region = cfg["product"], cfg.get("region", "us")
    ensure_cascget()

    # 1. WDT
    wdt_fid, how = resolve_wdt_fid(cfg)
    wdt = os.path.join(raw, "map.wdt")
    log("WDT fid %d via %s" % (wdt_fid, how))
    build = cascget(product, region, ["%d=%s" % (wdt_fid, wdt)] if need(wdt) else [])
    log("CDN %s/%s build %s (map.yaml pins %s)" % (product, region, build, cfg.get("build")))
    if cfg.get("build") and build != int(cfg["build"]):
        msg = "live build %s != pinned %s" % (build, cfg["build"])
        if not a.allow_build_drift:
            raise SystemExit(msg + ". Update map.yaml `build:` deliberately (renders get a new version), "
                                   "or pass --allow-build-drift.")
        log("WARNING " + msg)

    # 2. kind: global WMO placement, or ADT tiles
    pl = wdt_placements(wdt)
    json.dump(pl, open(os.path.join(raw, "placements.json"), "w"), indent=2)
    tiles = wdt_tiles(wdt)
    placed = None
    if not pl and tiles and cfg.get("placed_wmo"):
        sys.path.insert(0, HERE)
        import adt2obj
        os.makedirs(os.path.join(raw, "adt"), exist_ok=True)
        specs = ["%d=%s" % (t["obj0"], os.path.join(raw, "adt", "%02d_%02d_obj0.adt" % (t["x"], t["y"]))) for t in tiles
                 if need(os.path.join(raw, "adt", "%02d_%02d_obj0.adt" % (t["x"], t["y"])))]
        if specs:
            cascget(product, region, specs)
        found = []
        for t in tiles:
            tag = "%02d_%02d" % (t["x"], t["y"])
            found += [dict(m, adt=tag) for m in adt2obj.read_obj0_modf(os.path.join(raw, "adt", tag + "_obj0.adt"))
                      if m["flags"] & 0x8 and m["fid"] == int(cfg["placed_wmo"])]
        placed = one_placement(found, cfg["placed_wmo"])
        pl = [dict(placed, fileDataID=int(cfg["placed_wmo"]))]
        json.dump(pl, open(os.path.join(raw, "placements.json"), "w"), indent=2)
    elif not pl and tiles:
        return fetch_terrain(a, cfg, mdir, raw, product, region, build, wdt_fid, how, tiles, need)
    if placed:
        pass
    elif len(pl) != 1 or any(pl[0]["position"]) or any(pl[0]["rotation"]) or abs(pl[0]["scale"] - 1) > 1e-6:
        raise SystemExit("unsupported world shape (need exactly one origin-placed, unrotated, scale-1 WMO, "
                         "or a terrain WDT with tiles):\n" + json.dumps(pl, indent=2))
    root_fid = pl[0]["fileDataID"]
    root = os.path.join(raw, "root.wmo")
    if need(root):
        cascget(product, region, ["%d=%s" % (root_fid, root)])
    gfids = wmo_group_fids(root)
    if not gfids:
        raise SystemExit("root WMO has no GFID chunk — different group scheme, stop and inspect")
    open(os.path.join(raw, "group-ids.txt"), "w").write("".join("%d\n" % g for g in gfids))
    log("root fid %d, %d groups" % (root_fid, len(gfids)))

    # 3. groups + textures in one storage open
    specs = []
    for i, g in enumerate(gfids):
        p = os.path.join(raw, "groups", "group_%03d.wmo" % i)
        if need(p):
            specs.append("%d=%s" % (g, p))
    tex = subprocess.run([sys.executable, "-I", os.path.join(HERE, "wmo2obj.py"), raw, "--list-textures"],
                         capture_output=True, text=True, check=True).stdout.split()
    tex_fids = sorted({int(t) for t in tex if t.isdigit()})
    named = [t for t in tex if not t.isdigit()]
    if named:
        raise SystemExit("root uses texture NAMES (MOTX), not FileDataIDs; add listfile lookup: %s" % named[:5])
    for t in tex_fids:
        p = os.path.join(raw, "textures", "%d.blp" % t)
        if need(p):
            specs.append("%d=%s" % (t, p))
    if specs:
        log("fetching %d group/texture files" % len(specs))
        cascget(product, region, specs)

    # 4. OBJ
    obj = os.path.join(raw, "obj", "%s.obj" % a.slug)
    sh([sys.executable, "-I", os.path.join(HERE, "wmo2obj.py"), raw, "--out", obj])
    if placed:
        err, verified = place_obj(obj, root, placed, bool(cfg.get("allow_stale_placement_bounds")))
        pl[0]["extent_error_yd"] = round(err, 3)
        pl[0]["bounds_verified"] = verified
        if not verified:
            pl[0]["stale_bounds_allowed"] = True

    # 5. provenance
    files = {}
    for dp, _, fns in os.walk(raw):
        for fn in fns:
            p = os.path.join(dp, fn)
            files[os.path.relpath(p, raw)] = sha(p)
    prov = {
        "slug": a.slug, "kind": "wmo",
        "fetched": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "product": product, "region": region, "build": build, "wdt_fid": wdt_fid, "wdt_resolved_via": how,
        "root_fid": root_fid, "group_fids": gfids, "texture_fids": tex_fids,
        "casclib_commit": CASCLIB_COMMIT, "placement": pl[0], "placed_wmo": bool(placed), "obj": os.path.relpath(obj, raw),
        "files": files,
    }
    json.dump(prov, open(os.path.join(mdir, "fetch.json"), "w"), indent=2)  # committed; raw/ is not
    log("done: %s (%d files hashed)" % (os.path.relpath(obj, ROOT), len(files)))


if __name__ == "__main__":
    main()
