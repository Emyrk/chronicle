"""Classify the placed WMOs of a fetched terrain map: is this a real terrain map (Ruins of Lordaeron), or a
"placed-WMO dungeon" (Deadmines) where the terrain-kind GLB export silently deletes the dungeon? Read-only:
it reads maps/<slug>/raw/ (obj0 ADTs, root ADTs, WMO roots + groups, the OBJ's object names) and writes nothing.

  .venv/bin/python -I tools/classify_map.py <slug> [--json]

fetch_map.py runs it after a terrain fetch and prints the warning block when `warning_triggers` finds
something; this CLI always prints the full report plus a suggested map.yaml snippet.

Per placed WMO (MODF entries deduplicated by uniqueID; a placement the crop dropped is still listed, it just
is not in the OBJ): fid, uid, groups, world bbox, z vs the terrain under its footprint, buried fraction
(area of faces whose centroid lies > BURY_DEPTH under the terrain surface; faces over a terrain hole or
outside the fetched tiles are never buried) and the share of its INTERIOR groups (MOGP 0x2000) that is buried.
Flags:
  backdrop group     xy diagonal > BACKDROP_DIAG x the median group diagonal of its WMO AND area > the sum of
                     all its other groups (Deadmines g045: 28.5x, 6.1x): a skybox shell that sets the frame
                     and survives every cull as floating sheets.
  dressing candidate the fid's listfile directory differs from the main WMO's and it lies >= DRESSING_GAP yd
                     from it (touching props are skipped); without names (no listfile) it lies >= DRESSING_FAR
                     yd from it. A candidate list, not a verdict: Deadmines' two excavation platforms are in
                     another directory too and are dungeon. Nothing is dropped automatically.
  mostly buried      buried fraction >= MOSTLY_BURIED (informational: Lordaeron's Undercity is 63% buried
                     by design, so this alone is NOT a warning).
  roof-drop outlier  interior group whose ceiling-to-floor drop p95 exceeds the default --roof-max-drop (25)
                     by more than ROOF_SLACK.
                     Drop = a downward face's centroid down to the nearest upward face of the SAME group.
Warning (`warning_triggers`): a backdrop group, or the dominant interior WMO (>= DOMINANT_SHARE of the covered
interior area) with >= DOMINANT_BURIED of that interior area buried. The numbers that separate Deadmines from
the maps that must stay quiet are in README "Placed-WMO dungeons".

Terrain is read from the root ADTs present in raw/adt (a crop-limited fetch only has the crop's tiles):
faces outside them are reported as `uncovered`, never counted as buried.
"""
import argparse
import json
import math
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import adt2obj  # noqa: E402
from wmo2obj import read_group, read_root  # noqa: E402

BURY_DEPTH = 0.5        # export_glb --bury-depth default
BACKDROP_DIAG = 10.0    # xy diagonal vs the WMO's median group diagonal
MOSTLY_BURIED = 0.5
DRESSING_GAP = 3.0      # yd, with a differing listfile directory
DRESSING_FAR = 20.0     # yd, when there are no names
DOMINANT_SHARE = 0.5
DOMINANT_BURIED = 0.95
ROOF_DEFAULT = 25.0     # export_glb --roof-max-drop default
ROOF_SLACK = 5.0        # p95 must pass the default reach by this much to be an outlier (Deadmines g041: 25.1)
UP, DOWN = 0.5, -0.25   # export_glb: FLOOR faces nz > 0.5, roof candidates |nz| > 0.25
GRID_CELL = 8.0
LIST_MAX = 12           # report lines per flag list (--json has everything)


# ------------------------------------------------------------------ pure functions

def tri_geometry(V, T):
    """Per-triangle (area, unit normal z, centroid) of placed vertices V (Nx3) and triangles T (Mx3).
    The winding is the OBJ's, which is what export_glb's face normals use."""
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    n = np.cross(b - a, c - a)
    ln = np.linalg.norm(n, axis=1)
    nz = np.divide(n[:, 2], ln, out=np.zeros(len(ln)), where=ln > 0)
    return ln / 2, nz, (a + b + c) / 3


def group_diag(V):
    return float(math.hypot(*(V.max(0) - V.min(0))[:2]))


def find_backdrops(groups, ratio=BACKDROP_DIAG):
    """groups: [{gi, diag, area}]. Backdrop = diag > ratio x median diag AND area > the sum of all the others."""
    if len(groups) < 3:
        return []
    med = float(np.median([g["diag"] for g in groups]))
    total = sum(g["area"] for g in groups)
    return [{"gi": g["gi"], "diag": round(g["diag"], 1), "diag_x_median": round(g["diag"] / med, 1),
             "area": round(g["area"]), "area_x_others": round(g["area"] / (total - g["area"]), 2)}
            for g in groups if med > 0 and g["diag"] > ratio * med and g["area"] > total - g["area"]]


class Ground:
    """Terrain surface of the fetched root ADTs on the 4.17-yd vertex grid (outer vertices) + hole cells."""

    def __init__(self, chunk_list):
        pts, holes = [], []
        for c in chunk_list:
            if c["heights"] is None:
                continue
            bi = round((adt2obj.MAPC - c["x0"]) / adt2obj.UNIT)
            bj = round((adt2obj.MAPC - c["y0"]) / adt2obj.UNIT)
            h = c["heights"]
            pts += [(bi + i, bj + j, h[i * 17 + j]) for i in range(9) for j in range(9)]
            holes += [(bi + i, bj + j) for i in range(8) for j in range(8) if adt2obj.quad_is_hole(c, i, j)]
        self.empty = not pts
        if self.empty:
            return
        p = np.array(pts)
        self.i0, self.j0 = int(p[:, 0].min()), int(p[:, 1].min())
        self.z = np.full((int(p[:, 0].max()) - self.i0 + 2, int(p[:, 1].max()) - self.j0 + 2), np.nan)
        self.z[(p[:, 0] - self.i0).astype(int), (p[:, 1] - self.j0).astype(int)] = p[:, 2]
        self.hole = np.zeros(self.z.shape, bool)
        for i, j in holes:
            self.hole[i - self.i0, j - self.j0] = True

    def sample(self, x, y):
        """-> (terrain z or NaN where the tile is not fetched, True where the cell is a terrain hole)."""
        x, y = np.asarray(x, float), np.asarray(y, float)
        if self.empty:
            return np.full(x.shape, np.nan), np.zeros(x.shape, bool)
        u = (adt2obj.MAPC - x) / adt2obj.UNIT - self.i0
        v = (adt2obj.MAPC - y) / adt2obj.UNIT - self.j0
        ci, cj = np.floor(u).astype(int), np.floor(v).astype(int)
        ok = (ci >= 0) & (cj >= 0) & (ci < self.z.shape[0] - 1) & (cj < self.z.shape[1] - 1)
        ci, cj = np.clip(ci, 0, self.z.shape[0] - 2), np.clip(cj, 0, self.z.shape[1] - 2)
        fu, fv = u - ci, v - cj
        z = (self.z[ci, cj] * (1 - fu) * (1 - fv) + self.z[ci + 1, cj] * fu * (1 - fv) +
             self.z[ci, cj + 1] * (1 - fu) * fv + self.z[ci + 1, cj + 1] * fu * fv)
        ok &= ~np.isnan(z)
        return np.where(ok, z, np.nan), self.hole[ci, cj] & ok


def buried_mask(ground_z, hole, face_z, depth=BURY_DEPTH):
    """A face is buried iff terrain exists above it (not NaN, not a hole) by more than `depth`."""
    return ~np.isnan(ground_z) & ~hole & (ground_z > face_z + depth)


def ceiling_drops(V, T):
    """Drop (yd) from each downward face's centroid (nz < DOWN) to the nearest upward face (nz > UP) straight
    below it, both from the same group. Faces with no floor below are skipped. -> 1-D array."""
    area, nz, cen = tri_geometry(V, T)
    up, down = np.flatnonzero(nz > UP), np.flatnonzero(nz < DOWN)
    if not len(up) or not len(down):
        return np.zeros(0)
    tv = V[T[up]]  # (U, 3, 3)
    lo, hi = tv[:, :, :2].min(1), tv[:, :, :2].max(1)
    cells = {}
    for k in range(len(up)):
        for cx in range(int(lo[k, 0] // GRID_CELL), int(hi[k, 0] // GRID_CELL) + 1):
            for cy in range(int(lo[k, 1] // GRID_CELL), int(hi[k, 1] // GRID_CELL) + 1):
                cells.setdefault((cx, cy), []).append(k)
    cells = {k: np.array(v) for k, v in cells.items()}
    drops = []
    for f in down:
        x, y, zc = cen[f]
        cand = cells.get((int(x // GRID_CELL), int(y // GRID_CELL)))
        if cand is None:
            continue
        a, b, c = tv[cand, 0], tv[cand, 1], tv[cand, 2]
        d = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        ok = np.abs(d) > 1e-12
        d = np.where(ok, d, 1.0)
        l1 = ((b[:, 1] - c[:, 1]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (y - c[:, 1])) / d
        l2 = ((c[:, 1] - a[:, 1]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (y - c[:, 1])) / d
        l3 = 1 - l1 - l2
        inside = ok & (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not inside.any():
            continue
        zh = l1 * a[:, 2] + l2 * b[:, 2] + l3 * c[:, 2]
        below = inside & (zh < zc - 1e-3)
        if below.any():
            drops.append(zc - zh[below].max())
    return np.array(drops)


def drop_summary(drops):
    if not len(drops):
        return None
    return {"n": int(len(drops)), "p50": round(float(np.percentile(drops, 50)), 1),
            "p95": round(float(np.percentile(drops, 95)), 1), "max": round(float(drops.max()), 1)}


def suggest_roof_max_drop(group_stats, default=ROOF_DEFAULT):
    """None when no outlier group needs more than the default reach; else the largest drop + 2 yd, rounded
    up to a multiple of 10 (65.3 -> 70, the value the Deadmines recipe uses)."""
    if not any(g["p95"] > default + ROOF_SLACK for g in group_stats):
        return None
    return int(math.ceil((max(g["max"] for g in group_stats) + 2) / 10) * 10)


def rect_gap(points_xy, lo, hi):
    """Smallest xy distance from any of points_xy to the rectangle [lo, hi] (0 when one lies inside)."""
    d = np.maximum(np.maximum(lo - points_xy, points_xy - hi), 0)
    return float(np.hypot(d[:, 0], d[:, 1]).min())


def warning_triggers(c):
    """Why a terrain fetch deserves the loud warning (empty = quiet)."""
    out = []
    for b in c["backdrops"]:
        out.append("backdrop group %03d of WMO %d (xy diagonal %.0fx the median group, area %.1fx all other groups)" %
                   (b["gi"], b["fid"], b["diag_x_median"], b["area_x_others"]))
    dom = c.get("dominant_interior")
    if dom and dom["share"] >= DOMINANT_SHARE and dom["interior_buried"] >= DOMINANT_BURIED:
        out.append("WMO %d holds %.0f%% of the interior area and %.0f%% of that lies under intact terrain" %
                   (dom["fid"], 100 * dom["share"], 100 * dom["interior_buried"]))
    return out


# ------------------------------------------------------------------ loading raw/

def group_interior(path):
    """MOGP flag 0x2000 (same read as export_glb.group_flags)."""
    buf = open(path, "rb").read()
    i = buf.find(b"PGOM")
    return bool(struct.unpack_from("<I", buf, i + 16)[0] & 0x2000) if i >= 0 else False


def load_ground(raw, tiles):
    chunk_list = []
    for t in tiles:
        p = os.path.join(raw, "adt", "%02d_%02d_root.adt" % (t["x"], t["y"]))
        if os.path.exists(p):
            chunk_list += adt2obj.read_root_adt(p)["chunks"]
    return Ground(chunk_list)


def load_placements(raw, tiles):
    """Unique (by uniqueID) FileDataID placements of every obj0 ADT in raw/adt."""
    out = {}
    for t in tiles:
        p = os.path.join(raw, "adt", "%02d_%02d_obj0.adt" % (t["x"], t["y"]))
        if os.path.exists(p):
            for m in adt2obj.read_obj0_modf(p):
                if m["flags"] & 0x8:
                    out.setdefault(m["uid"], dict(m, adts=[]))["adts"].append("%02d_%02d" % (t["x"], t["y"]))
    return list(out.values())


def load_placed_wmo(raw, pl):
    """Placed groups of one placement: [{gi, V, T, diag, area, interior}] (collision-only faces already dropped
    by wmo2obj.read_group, as in the OBJ)."""
    wdir = os.path.join(raw, "wmo", str(pl["fid"]))
    if not os.path.exists(os.path.join(wdir, "root.wmo")):
        return None
    _, gfids = read_root(os.path.join(wdir, "root.wmo"))
    groups = []
    for gi in range(len(gfids)):
        gp = os.path.join(wdir, "groups", "group_%03d.wmo" % gi)
        if not os.path.exists(gp):
            continue
        g = read_group(gp)
        if not g["tris"]:
            continue
        V, _ = adt2obj.place_vertices(np.asarray(g["verts"]), pl)
        T = np.array([t[1:] for t in g["tris"]])
        area, nz, cen = tri_geometry(V, T)
        groups.append({"gi": gi, "V": V, "T": T, "area": float(area.sum()), "diag": group_diag(V),
                       "interior": group_interior(gp), "_a": area, "_c": cen})
    return groups


def listfile_names(path, fids):
    names = {}
    if path and os.path.exists(path):
        for line in open(path, errors="replace"):
            i = line.find(";")
            if i > 0 and line[:i].isdigit() and int(line[:i]) in fids:
                names[int(line[:i])] = line[i + 1:].strip()
    return names


def obj_object_names(obj_path):
    if not obj_path or not os.path.exists(obj_path):
        return None
    with open(obj_path) as f:
        return [l[2:].strip() for l in f if l.startswith("o wmo_")]


# ------------------------------------------------------------------ classification

def classify(mdir, listfile=None, with_drops=True):
    """Classification dict for maps/<slug> (mdir). with_drops: True always runs the ceiling-drop pass, "if_warn"
    runs it only when a warning trigger fired (fetch_map: every terrain fetch pays for the cheap part only)."""
    raw = os.path.join(mdir, "raw")
    tiles = json.load(open(os.path.join(raw, "tiles.json")))
    fetch = json.load(open(os.path.join(mdir, "fetch.json")))
    ground = load_ground(raw, tiles)
    pls = load_placements(raw, tiles)
    names = listfile_names(listfile, {p["fid"] for p in pls})
    rows, backdrops, wmos = [], [], {}
    for pl in pls:
        groups = load_placed_wmo(raw, pl)
        if not groups:
            continue
        bds = find_backdrops(groups)
        bd_gi = {b["gi"] for b in bds}
        for b in bds:
            backdrops.append(dict(b, fid=pl["fid"], uid=pl["uid"]))
        keep = [g for g in groups if g["gi"] not in bd_gi]  # a backdrop must not decide burial or footprint
        area = np.concatenate([g["_a"] for g in keep])
        cen = np.vstack([g["_c"] for g in keep])
        gz, hole = ground.sample(cen[:, 0], cen[:, 1])
        buried = buried_mask(gz, hole, cen[:, 2])
        covered = ~np.isnan(gz)
        interior = np.concatenate([np.full(len(g["_a"]), g["interior"]) for g in keep])
        tot = float(area.sum())
        i_cov = float(area[interior & covered].sum())
        V = np.vstack([g["V"] for g in keep])
        lo, hi = V.min(0), V.max(0)
        under = gz[covered]
        rows.append({
            "fid": pl["fid"], "uid": pl["uid"], "name": names.get(pl["fid"]), "groups": len(groups),
            "interior_groups": sum(g["interior"] for g in groups), "adts": pl["adts"],
            "bbox": {"x": [round(float(lo[0]), 1), round(float(hi[0]), 1)], "y": [round(float(lo[1]), 1), round(float(hi[1]), 1)],
                     "z": [round(float(lo[2]), 1), round(float(hi[2]), 1)]},
            "terrain_z_under": {"min": round(float(under.min()), 1), "median": round(float(np.median(under)), 1),
                                "max": round(float(under.max()), 1)} if len(under) else None,
            "area": round(tot), "buried": round(float(area[buried].sum() / tot), 3) if tot else 0.0,
            "over_hole": round(float(area[hole].sum() / tot), 3) if tot else 0.0,
            "uncovered": round(float(area[~covered].sum() / tot), 3) if tot else 0.0,
            "interior_area_covered": round(i_cov),
            "interior_buried": round(float(area[interior & buried].sum() / i_cov), 3) if i_cov else None,
            "_interior_buried_area": float(area[interior & buried].sum()),
            "_xy": V[:, :2], "_groups": groups,
        })
        wmos[pl["uid"]] = rows[-1]
    # main WMO: the biggest interior area (backdrop excluded), else the biggest area
    main = max(rows, key=lambda r: (r["interior_area_covered"], r["area"]), default=None)
    total_int = sum(r["interior_area_covered"] for r in rows)
    dominant = None
    if main and total_int > 0:
        dominant = {"fid": main["fid"], "uid": main["uid"], "share": round(main["interior_area_covered"] / total_int, 3),
                    "interior_buried": main["interior_buried"]}
    dressing = []
    if main:
        mdir_name = (main["name"] or "").rsplit("/", 1)[0].lower() if main["name"] else None
        for r in rows:
            if r is main:
                continue
            gap = rect_gap(main["_xy"], np.array([r["bbox"]["x"][0], r["bbox"]["y"][0]]),
                           np.array([r["bbox"]["x"][1], r["bbox"]["y"][1]]))
            other_dir = bool(r["name"] and mdir_name and r["name"].rsplit("/", 1)[0].lower() != mdir_name)
            named = bool(r["name"] and mdir_name)
            if (other_dir and gap >= DRESSING_GAP) if named else gap >= DRESSING_FAR:
                dressing.append({"fid": r["fid"], "uid": r["uid"], "name": r["name"], "gap_yd": round(gap, 1),
                                 "other_directory": other_dir})
    c = {
        "classifier": 1, "placements": len(rows),
        "main_wmo": {"fid": main["fid"], "uid": main["uid"], "name": main["name"]} if main else None,
        "dominant_interior": dominant, "backdrops": backdrops,
        "dressing": sorted(dressing, key=lambda d: (d["fid"], d["uid"])),
        "mostly_buried": [{"fid": r["fid"], "uid": r["uid"], "buried": r["buried"]} for r in rows
                          if r["buried"] >= MOSTLY_BURIED],
        "roof_drop_outliers": [], "suggested_roof_max_drop": None,
        "terrain_tiles_fetched": sum(os.path.exists(os.path.join(raw, "adt", "%02d_%02d_root.adt" % (t["x"], t["y"])))
                                     for t in tiles),
        "obj": fetch.get("obj"),
    }
    c["warning_triggers"] = warning_triggers(c)
    c["_rows"] = rows
    if with_drops is True or (with_drops == "if_warn" and c["warning_triggers"]):
        add_roof_drops(c)
    return c


def add_roof_drops(c):
    """Ceiling-drop stats of every interior group -> roof_drop_outliers + suggested_roof_max_drop."""
    drops = []
    for r in c["_rows"]:
        for g in r["_groups"]:
            if g["interior"]:
                s = drop_summary(ceiling_drops(g["V"], g["T"]))
                if s:
                    drops.append(dict(s, fid=r["fid"], uid=r["uid"], gi=g["gi"]))
    c["roof_drop_outliers"] = sorted([d for d in drops if d["p95"] > ROOF_DEFAULT + ROOF_SLACK], key=lambda d: -d["p95"])
    c["suggested_roof_max_drop"] = suggest_roof_max_drop(drops)


def public(c):
    """The JSON-safe part of a classification (what fetch.json stores)."""
    return {k: v for k, v in c.items() if not k.startswith("_")}


# ------------------------------------------------------------------ reporting

def object_prefixes(c, raw_obj_names):
    """map.yaml object_exclude_prefix entries for the flagged backdrop groups, from the OBJ's real object names
    (they carry the tile + MODF index of the first placement, so they change when the crop does)."""
    out = []
    for b in c["backdrops"]:
        hit = sorted(n for n in (raw_obj_names or []) if n.startswith("wmo_%d_" % b["fid"]) and
                     n.endswith("_group_%03d" % b["gi"]))
        out += hit or ["wmo_%d_<tile>_<index>_group_%03d" % (b["fid"], b["gi"])]
    return out


def warning_block(c, slug):
    t = c["warning_triggers"]
    if not t:
        return None
    lines = ["", "=" * 78,
             "WARNING: %s looks like a PLACED-WMO DUNGEON (Deadmines shape), not a terrain map." % slug,
             "The terrain-kind GLB export will delete the buried dungeon or frame it on a backdrop:",
             "the result is a silently bad GLB. Do not publish one without reading README",
             "'Placed-WMO dungeons (Deadmines)'. Why:"]
    lines += ["  - " + x for x in t]
    lines += ["Details and a suggested map.yaml: .venv/bin/python -I tools/classify_map.py %s" % slug,
              "(also written to fetch.json `classification`)", "=" * 78, ""]
    return "\n".join(lines)


def report(c, slug, obj_names):
    L = ["classify_map %s: %d placed WMOs (uid-unique), terrain root ADTs fetched: %d" %
         (slug, c["placements"], c["terrain_tiles_fetched"])]
    m = c["main_wmo"]
    if m:
        L.append("main WMO (largest interior area): %d uid %d %s" % (m["fid"], m["uid"], m["name"] or "(no listfile)"))
    L.append("")
    L.append("placed WMOs, largest first (z = placed bbox z, terrain = min/median/max under the footprint;")
    L.append("buried/hole/uncovered = share of area; int-buried = share of the interior groups' area):")
    for r in sorted(c["_rows"], key=lambda r: -r["area"])[:25]:
        tz = r["terrain_z_under"]
        L.append("  %7d uid %-9d g=%-3d(int %-3d) area %9d z[%6.1f..%6.1f] terrain[%s] buried %.2f hole %.2f uncovered %.2f int-buried %s  %s" % (
            r["fid"], r["uid"], r["groups"], r["interior_groups"], r["area"], r["bbox"]["z"][0], r["bbox"]["z"][1],
            "%.0f/%.0f/%.0f" % (tz["min"], tz["median"], tz["max"]) if tz else "none",
            r["buried"], r["over_hole"], r["uncovered"],
            "-" if r["interior_buried"] is None else "%.2f" % r["interior_buried"],
            (r["name"] or "").rsplit("/", 1)[-1]))
    if len(c["_rows"]) > 25:
        L.append("  ... %d more" % (len(c["_rows"]) - 25))
    L.append("")
    L.append("BACKDROP groups (xy diagonal > %gx the WMO's median group AND area > all its other groups): %s" %
             (BACKDROP_DIAG, "none" if not c["backdrops"] else ""))
    for b in c["backdrops"]:
        L.append("  WMO %d uid %d group %03d: diag %.0f yd (%.1fx median), area %d (%.2fx all other groups)" %
                 (b["fid"], b["uid"], b["gi"], b["diag"], b["diag_x_median"], b["area"], b["area_x_others"]))
    L.append("DRESSING candidates (other listfile directory and >= %g yd from the main WMO; >= %g yd when there are no names): %s" %
             (DRESSING_GAP, DRESSING_FAR, "none" if not c["dressing"] else "%d" % len(c["dressing"])))
    for d in c["dressing"][:LIST_MAX]:
        L.append("  %d uid %d gap %.1f yd%s  %s" % (d["fid"], d["uid"], d["gap_yd"],
                                                    " (other directory)" if d["other_directory"] else "", d["name"] or ""))
    if len(c["dressing"]) > LIST_MAX:
        L.append("  ... %d more" % (len(c["dressing"]) - LIST_MAX))
    mb = c["mostly_buried"]
    L.append("MOSTLY BURIED (>= %.0f%% of the area under terrain; informational): %s" %
             (100 * MOSTLY_BURIED, "none" if not mb else ", ".join("%d/uid %d (%.2f)" % (b["fid"], b["uid"], b["buried"]) for b in mb[:LIST_MAX]) +
              (" ... %d more" % (len(mb) - LIST_MAX) if len(mb) > LIST_MAX else "")))
    dom = c["dominant_interior"]
    if dom:
        L.append("dominant interior WMO: %d holds %.0f%% of the interior area, %s of it buried" %
                 (dom["fid"], 100 * dom["share"], "-" if dom["interior_buried"] is None else "%.0f%%" % (100 * dom["interior_buried"])))
    L.append("ROOF-DROP outliers (interior group ceiling drop p95 > default --roof-max-drop %g + %g): %s" %
             (ROOF_DEFAULT, ROOF_SLACK, "none" if not c["roof_drop_outliers"] else ""))
    for d in c["roof_drop_outliers"][:LIST_MAX]:
        L.append("  WMO %d uid %d group %03d: p50 %.1f p95 %.1f max %.1f (%d downward faces with a floor below)" %
                 (d["fid"], d["uid"], d["gi"], d["p50"], d["p95"], d["max"], d["n"]))
    if len(c["roof_drop_outliers"]) > LIST_MAX:
        L.append("  ... %d more (--json has all)" % (len(c["roof_drop_outliers"]) - LIST_MAX))
    L.append("")
    trig = c["warning_triggers"]
    L.append("verdict: " + ("PLACED-WMO DUNGEON SHAPE" if trig else "no warning"))
    L += ["  - " + t for t in trig]
    if trig:
        L += ["", "suggested map.yaml (review; crop to the basin where the dungeon needs terrain, see README):",
              "  frame_include_all: true"]
        pre = object_prefixes(c, obj_names)
        if pre:
            L.append("  object_exclude_prefix: " + ",".join(pre))
        if c["dressing"]:
            L.append("  # dressing candidates, NOT applied (drop the ones the dungeon does not use; with a log, none may hold samples):")
            L.append("  #   object_exclude_prefix: " + ",".join(pre + ["wmo_%d" % f for f in sorted({d["fid"] for d in c["dressing"]})]))
        s = c["suggested_roof_max_drop"]
        L.append("# render_set.py <slug> <label> --glb --glb-args \"--keep-buried --roof-cull%s\"  (no crop is suggested: it is a judgement)" %
                 (" --roof-max-drop %d" % s if s else ""))
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--json", action="store_true", help="print the classification as JSON")
    a = ap.parse_args()
    import rmconfig
    root = rmconfig.workdir()
    mdir = os.path.join(root, "maps", a.slug)
    fetch = json.load(open(os.path.join(mdir, "fetch.json")))
    if fetch.get("kind") != "terrain" or fetch.get("layout") == "monolithic-1.12":
        raise SystemExit("%s: classify_map reads CDN terrain fetches (kind terrain, split ADTs); this one is %s/%s" %
                         (a.slug, fetch.get("kind"), fetch.get("layout", "split")))
    c = classify(mdir, os.path.join(root, "cache", "community-listfile.csv"))
    if a.json:
        print(json.dumps(public(c), indent=2))
        return
    print(report(c, a.slug, obj_object_names(os.path.join(mdir, "raw", c["obj"]) if c["obj"] else None)))


if __name__ == "__main__":
    main()
