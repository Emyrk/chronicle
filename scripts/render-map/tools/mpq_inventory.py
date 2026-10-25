"""Inventory of what a 1.12 client's CUSTOM patches touch under world\\maps and world\\wmo.

  python3 -I mpq_inventory.py --client <mpq_clients name or path> --custom-from patch-3.mpq --json inv.json --md inv.md

Stock = every archive before --custom-from in load order (base archives + Blizzard's patch.MPQ and
patch-2.MPQ for 1.12.1); custom = that archive and every later one. Per map (from the winning
Map.dbc): instance type, whether the map is new (not in the stock Map.dbc), and for its WDT the
global WMO (MWMO) or ADT tiles, each counted as stock / overridden / added by custom archives.
Per world\\wmo directory: files stock-only / overridden / added.
"""
import argparse
import collections
import json
import os
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mpq_chain  # noqa: E402

ITYPE = {0: "world", 1: "dungeon", 2: "raid", 3: "pvp", 4: "arena"}


def read_map_dbc(path):
    b = open(path, "rb").read()
    _, n, fc, rs, ss = struct.unpack_from("<4s4I", b)
    sb = b[20 + n * rs:]
    def s(o):
        return sb[o:sb.index(b"\0", o)].decode("utf8", "replace")
    out = {}
    for i in range(n):
        r = struct.unpack_from("<%dI" % fc, b, 20 + i * rs)
        out[r[0]] = {"directory": s(r[1]), "type": ITYPE.get(r[2], str(r[2])), "name": s(r[4])}
    return out


def extract(chain, arch, stored, out):
    subprocess.run([mpq_chain.MPQGET, "get", chain.path_of(arch), "%s=%s" % (stored, out)],
                   check=True, stdout=subprocess.DEVNULL)


def wdt_info(buf):
    """-> ('wmo', name) | ('terrain', n_tiles)"""
    p, mwmo, tiles = 0, b"", 0
    while p + 8 <= len(buf):
        tag, size = buf[p:p + 4][::-1], struct.unpack_from("<I", buf, p + 4)[0]
        if tag == b"MAIN":
            tiles = sum(1 for i in range(4096) if struct.unpack_from("<I", buf, p + 8 + 8 * i)[0] & 1)
        elif tag == b"MWMO":
            mwmo = buf[p + 8:p + 8 + size].split(b"\0")[0]
        p += 8 + size
    return ("wmo", mwmo.decode("ascii", "replace")) if mwmo else ("terrain", tiles)


def adt_mwmo(buf):
    p, out = 0, set()
    while p + 8 <= len(buf):
        tag, size = buf[p:p + 4][::-1], struct.unpack_from("<I", buf, p + 4)[0]
        if tag == b"MWMO":
            out |= {n.decode("ascii", "replace").lower().replace("/", "\\") for n in buf[p + 8:p + 8 + size].split(b"\0") if n}
        p += 8 + size
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    ap.add_argument("--custom-from", default="patch-3.mpq")
    ap.add_argument("--json")
    ap.add_argument("--md")
    a = ap.parse_args()
    c = mpq_chain.Chain(a.client)
    names = [os.path.basename(p) for p in c.archives]
    cut = [n.lower() for n in names].index(a.custom_from.lower())
    custom = set(names[cut:])

    def status(key):
        hits = c.files[key]
        s = [h for h in hits if h[0] not in custom]
        k = [h for h in hits if h[0] in custom]
        return "stock" if not k else ("overridden" if s else "added")

    tmp = tempfile.mkdtemp()
    def dbc(archs):
        hits = [h for h in c.files["dbfilesclient\\map.dbc"] if h[0] in archs]
        p = os.path.join(tmp, "map-%d.dbc" % len(archs))
        extract(c, hits[-1][0], hits[-1][2], p)
        return read_map_dbc(p), hits[-1][0]
    stock_maps, stock_src = dbc(set(names[:cut]))
    maps, win_src = dbc(set(names))

    rows = []
    for mid, m in sorted(maps.items()):
        d = m["directory"].lower()
        prefix = "world\\maps\\%s\\" % d
        mfiles = [k for k in c.files if k.startswith(prefix)]
        cnt = collections.Counter(status(k) for k in mfiles)
        row = {"id": mid, "directory": m["directory"], "name": m["name"], "type": m["type"],
               "new_map": mid not in stock_maps or stock_maps[mid]["directory"].lower() != d,
               "map_files": dict(cnt)}
        wdt = prefix + d + ".wdt"
        if wdt in c.files:
            w = c.files[wdt][-1]
            p = os.path.join(tmp, "x.wdt")
            extract(c, w[0], w[2], p)
            kind, val = wdt_info(open(p, "rb").read())
            row["wdt"] = {"archive": w[0], "status": status(wdt), "kind": kind}
            if kind == "wmo":
                stem = val.lower().replace("/", "\\")[:-4]
                wf = [k for k in c.files if k == stem + ".wmo" or (k.startswith(stem + "_") and k[len(stem) + 1:-4].isdigit())]
                row["wdt"]["wmo"] = val
                row["wdt"]["wmo_files"] = dict(collections.Counter(status(k) for k in wf))
                row["wdt"]["wmo_archives"] = sorted({c.files[k][-1][0] for k in wf})
            else:
                adts = [k for k in mfiles if k.endswith(".adt")]
                row["wdt"]["tiles"] = val
                row["wdt"]["adt_files"] = dict(collections.Counter(status(k) for k in adts))
                if m["type"] != "world":  # instances: the WMOs the ADTs place (MWMO), and their status
                    placed = set()
                    for k in adts:
                        h = c.files[k][-1]
                        extract(c, h[0], h[2], os.path.join(tmp, "x.adt"))
                        placed |= adt_mwmo(open(os.path.join(tmp, "x.adt"), "rb").read())
                    wf = [k for k in c.files for w in placed if k == w or (k.startswith(w[:-4] + "_") and k[len(w) - 3:-4].isdigit())]
                    row["wdt"]["placed_wmos"] = len(placed)
                    row["wdt"]["placed_wmo_files"] = dict(collections.Counter(status(k) for k in wf))
                    row["wdt"]["placed_wmo_touched"] = sorted(w.split("\\")[-1] for w in placed
                        if any(status(k) != "stock" for k in wf if k.startswith(w[:-4])))
        rows.append(row)

    wmo_dirs = collections.defaultdict(collections.Counter)
    for k in c.files:
        if k.startswith("world\\wmo\\"):
            wmo_dirs[k.rsplit("\\", 1)[0]][status(k)] += 1
    wmo_touched = {d: dict(v) for d, v in sorted(wmo_dirs.items()) if v.get("overridden") or v.get("added")}

    res = {"client": a.client, "archives": names, "custom": names[cut:], "map_dbc_stock": stock_src, "map_dbc_stock_count": len(stock_maps),
           "map_dbc_winner": win_src, "maps": rows, "wmo_dirs_touched": wmo_touched}
    if a.json:
        open(a.json, "w").write(json.dumps(res, indent=1))
    if a.md:
        open(a.md, "w").write(render_md(res))
    print(json.dumps({"maps": len(rows), "new": sum(r["new_map"] for r in rows), "wmo_dirs_touched": len(wmo_touched)}))


def render_md(r):
    def fmt(d):
        return ", ".join("%s %d" % kv for kv in sorted(d.items())) if d else "-"
    L = ["# %s — what the custom patches touch (world\\maps, world\\wmo)" % os.path.basename(os.path.normpath(r["client"])), "",
         "`tools/mpq_inventory.py`; custom = %s; stock Map.dbc = %s (%d maps), winner = %s. Counts are files: "
         "stock = only in stock archives, overridden = stock file replaced by a custom archive, added = custom only." % (
             "..".join([r["custom"][0], r["custom"][-1]]), r["map_dbc_stock"],
             r["map_dbc_stock_count"], r["map_dbc_winner"]), "",
         "## Instances (every dungeon/raid/pvp map; world maps only if new)", "",
         "| id | map | type | geometry | custom touches |", "|---|---|---|---|---|"]
    order = {"raid": 0, "dungeon": 1, "pvp": 2, "world": 3}
    for m in sorted(r["maps"], key=lambda m: (order.get(m["type"], 9), not m["new_map"], m["id"])):
        if m["type"] == "world" and not m["new_map"]:
            continue
        w = m.get("wdt") or {}
        if not w:
            geo, touch = "no WDT", "-"
        elif w["kind"] == "wmo":
            geo, touch = "WMO `%s`" % w["wmo"].split("\\")[-1], "WMO files: " + fmt(w["wmo_files"])
        else:
            geo = "terrain, %d tiles" % w["tiles"]
            touch = "ADT: " + fmt(w["adt_files"])
            if "placed_wmos" in w:
                touch += "; %d placed WMOs: %s" % (w["placed_wmos"], fmt(w["placed_wmo_files"]))
                if w["placed_wmo_touched"]:
                    touch += " (changed: %s)" % ", ".join(w["placed_wmo_touched"][:4]) + (" …" if len(w["placed_wmo_touched"]) > 4 else "")
        changed = m["new_map"] or "overridden" in touch or "added" in touch
        name = ("**%s** (new)" if m["new_map"] else ("**%s**" if changed else "%s")) % m["name"]
        L.append("| %d | %s | %s | %s | %s |" % (m["id"], name, m["type"], geo, touch))
    L += ["", "## world\\wmo\\dungeon directories with custom files", "",
          "| directory | stock | overridden | added |", "|---|---|---|---|"]
    other = collections.defaultdict(collections.Counter)
    dung = collections.defaultdict(collections.Counter)
    for d, v in r["wmo_dirs_touched"].items():
        parts = d.split("\\")
        if len(parts) >= 4 and parts[2] == "dungeon":
            dung[parts[3]].update(v)
        else:
            other["\\".join(parts[:3])].update(v)
    for d, v in sorted(dung.items()):
        L.append("| `%s` | %d | %d | %d |" % (d, v.get("stock", 0), v.get("overridden", 0), v.get("added", 0)))
    L += ["", "Other world\\wmo areas (summed over their sub-directories): " + "; ".join(
        "`%s` overridden %d, added %d" % (d, v.get("overridden", 0), v.get("added", 0)) for d, v in sorted(other.items())) + "."]
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    main()
