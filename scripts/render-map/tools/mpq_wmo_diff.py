"""Compare one WMO across sources: the CDN fetch of a map vs the same WMO in a 1.12 MPQ client
(stock archive and the patch-chain winner). Decoded, not raw bytes: 1.12 groups store MOPY
(u8 flags/material) and MOTX names; modern ones MPY2 and FileDataIDs.

  python3 -I mpq_wmo_diff.py <slug> --client <mpq_clients name or path> --json out.json

What it measures, per source: groups, vertices, rendered triangles, triangle area, bbox,
material ids and their texture names; between sources: the share of triangles (by centroid
rounded to 1 cm, plus material texture) present in the other, and per texture the decoded
pixels (exact match, mean abs diff, 8x8 average-hash distance).
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rmconfig  # noqa: E402
ROOT = rmconfig.workdir()  # maps/, cache/, data/ (local.yaml `workdir`)
import wmo2obj  # noqa: E402
import mpq_chain  # noqa: E402

LISTFILE = os.path.join(ROOT, "cache", "community-listfile.csv")


def stock_hits(hits):
    """(archive, size, name) hits from stock archives: everything before patch-3 (mpq_inventory --custom-from)."""
    return [h for h in hits if not (h[0].lower().startswith("patch-") and h[0].lower() != "patch-2.mpq")]


def fid_names(fids):
    want, out = set(fids), {}
    for line in open(LISTFILE, errors="replace"):
        f, _, n = line.strip().partition(";")
        if f.isdigit() and int(f) in want:
            out[int(f)] = n
    return out


def load_model(root_path, group_paths, texname):
    """texname(material) -> lower texture path. Returns arrays + stats."""
    momt, _ = wmo2obj.read_root(root_path)
    tris, mats, liquid = [], [], 0
    for gp in group_paths:
        g = wmo2obj.read_group(gp)
        v = np.array(g["verts"], dtype=np.float64).reshape(-1, 3)
        for m, a, b, c in g["tris"]:
            tris.append((v[a], v[b], v[c]))
            mats.append(texname(momt[m]) if m < len(momt) else "?")
        liquid += len(g["liquid"] or [])
    t = np.array(tris).reshape(-1, 3, 3)
    area = 0.5 * np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1)
    cent = np.round(t.mean(axis=1) * 100).astype(np.int64)
    keys = set(zip(map(tuple, cent), mats))
    textures = sorted({texname(m) for m in momt})
    return {"groups": len(group_paths), "triangles": int(len(t)), "area_sq_yd": round(float(area.sum()), 1),
            "bbox": [np.round(t.reshape(-1, 3).min(0), 2).tolist(), np.round(t.reshape(-1, 3).max(0), 2).tolist()],
            "materials": len(momt), "liquid_tiles": liquid, "textures": textures,
            "_keys": keys, "_area": dict(zip(zip(map(tuple, cent), mats), area))}


def overlap(a, b):
    common = a["_keys"] & b["_keys"]
    area_a = sum(a["_area"].values())
    return {"tris_of_a_in_b": round(len(common) / max(1, len(a["_keys"])), 4),
            "area_of_a_in_b": round(sum(a["_area"][k] for k in common) / max(1e-9, area_a), 4)}


def ahash(img):
    g = np.asarray(img.convert("L").resize((8, 8), Image.BILINEAR), dtype=np.float32)
    return (g > g.mean()).flatten()


def tex_compare(pa, pb):
    a, b = Image.open(pa).convert("RGBA"), Image.open(pb).convert("RGBA")
    r = {"size_a": a.size, "size_b": b.size, "ahash_dist": int((ahash(a) != ahash(b)).sum())}
    if a.size == b.size:
        da, db = np.asarray(a, dtype=np.int16), np.asarray(b, dtype=np.int16)
        r["exact"] = bool((da == db).all())
        r["mean_abs_rgb"] = round(float(np.abs(da[..., :3] - db[..., :3]).mean()), 3)
    else:
        bb = b.resize(a.size, Image.LANCZOS)
        r["exact"] = False
        r["mean_abs_rgb_resized"] = round(float(np.abs(np.asarray(a, dtype=np.int16)[..., :3]
                                                       - np.asarray(bb, dtype=np.int16)[..., :3]).mean()), 3)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--client", required=True)
    ap.add_argument("--json")
    a = ap.parse_args()
    mdir = os.path.join(ROOT, "maps", a.slug)
    raw = os.path.join(mdir, "raw")
    fetch = json.load(open(os.path.join(mdir, "fetch.json")))
    names = fid_names([fetch["root_fid"]] + fetch["texture_fids"])
    root_name = names[fetch["root_fid"]].replace("/", "\\")
    stem = root_name[:-4]
    tex_fid = {names[f].lower(): f for f in fetch["texture_fids"] if f in names}

    # CDN
    cdn = load_model(os.path.join(raw, "root.wmo"), [os.path.join(raw, "groups", "group_%03d.wmo" % i)
                                                      for i in range(len(fetch["group_fids"]))],
                     lambda m: names.get(m.get("texfid"), "fid:%s" % m.get("texfid")).lower())

    chain = mpq_chain.Chain(a.client)
    out_root = os.path.join(raw, "mpq-" + os.path.basename(os.path.normpath(rmconfig.mpq_client(a.client))))
    files = {k: chain.files[k] for k in chain.glob(stem + "*")}
    srcs = {}
    for label, pick in (("stock", 0), ("winner", -1)):
        d = os.path.join(out_root, label)
        root_hits = chain.files[root_name.lower()]
        groups = sorted(k for k in files if k.endswith(".wmo") and k != root_name.lower()
                        and k[len(stem):].lstrip("_").rstrip(".wmo").isdigit() and len(files[k]) > (0 if pick < 0 else 0))
        # stock = the last stock archive that holds the name (base + Blizzard's patch.MPQ/patch-2.MPQ:
        # Blackwing Lair's root and groups 018-023 are patch.MPQ's); winner = the last
        def grab(name, arch_idx):
            hits = chain.files[name]
            arch, _, stored = hits[arch_idx] if arch_idx < 0 else stock_hits(hits)[-1]
            p = os.path.join(d, stored.split("\\")[-1].lower())
            os.makedirs(d, exist_ok=True)
            subprocess.run([mpq_chain.MPQGET, "get", chain.path_of(arch), "%s=%s" % (stored, p)], check=True)
            return p, arch
        rp, rarch = grab(root_name.lower(), pick)
        nroot = len(wmo2obj.read_root(rp)[0])
        # group count from MOHD of THIS root; group names follow the root stem
        buf = open(rp, "rb").read()
        ngroups = next(int.from_bytes(buf[o + 4:o + 8], "little") for t, o, s in wmo2obj.chunks(buf) if t == "MOHD")
        gps, garchs = [], []
        for i in range(ngroups):
            gname = "%s_%03d.wmo" % (stem.lower(), i)
            if pick == 0 and not stock_hits(chain.files.get(gname, [])):
                continue  # a group only custom archives add (MOHD of the stock root never counts it)
            p, ga = grab(gname, pick)
            gps.append(p); garchs.append(ga)
        srcs[label] = {"root_archive": rarch, "group_archives": sorted(set(garchs)), "paths": (rp, gps)}

    def texname_mpq(m):
        return m.get("texname", "?").lower().replace("/", "\\")
    models = {"cdn": cdn}
    for label in srcs:
        rp, gps = srcs[label]["paths"]
        models[label] = load_model(rp, gps, lambda m: texname_mpq(m).replace("\\", "/"))
        models[label].update({k: v for k, v in srcs[label].items() if k != "paths"})

    pairs = {}
    for x, y in (("cdn", "stock"), ("stock", "cdn"), ("cdn", "winner"), ("winner", "cdn"), ("stock", "winner"), ("winner", "stock")):
        pairs["%s_vs_%s" % (x, y)] = overlap(models[x], models[y])

    # textures: every texture either model names, CDN png vs MPQ winner blp decoded
    tex = {}
    tdir = os.path.join(out_root, "textures")
    os.makedirs(tdir, exist_ok=True)
    for t in sorted(set(models["cdn"]["textures"]) | set(models["winner"]["textures"]) | set(models["stock"]["textures"])):
        hits = chain.files.get(t.replace("/", "\\"))
        row = {"in_cdn_model": t in models["cdn"]["textures"], "in_stock_model": t in models["stock"]["textures"],
               "in_winner_model": t in models["winner"]["textures"],
               "mpq_archives": [h[0] for h in hits] if hits else []}
        if hits and t in tex_fid:
            png = os.path.join(raw, "obj", "textures", "%d.png" % tex_fid[t])
            for label, idx in (("stock", 0), ("winner", -1)):
                if idx == 0 and not stock_hits(hits):
                    continue
                arch, _, stored = hits[idx] if idx < 0 else stock_hits(hits)[-1]
                p = os.path.join(tdir, "%s-%s" % (label, stored.split("\\")[-1].lower()))
                subprocess.run([mpq_chain.MPQGET, "get", chain.path_of(arch), "%s=%s" % (stored, p)], check=True)
                row["cdn_vs_" + label] = tex_compare(png, p)
        tex[t] = row

    for m in models.values():
        m.pop("_keys"); m.pop("_area")
    res = {"slug": a.slug, "client": a.client, "archives": [os.path.basename(p) for p in chain.archives],
           "root": root_name, "cdn_build": fetch["build"], "cdn_product": fetch["product"],
           "files": {files[k][-1][2]: [h[0] for h in files[k]] for k in files},
           "models": models, "overlap": pairs, "textures": tex}
    s = json.dumps(res, indent=1, default=list)
    if a.json:
        open(a.json, "w").write(s)
    print(s)


if __name__ == "__main__":
    main()
