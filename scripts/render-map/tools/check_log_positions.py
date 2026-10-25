"""Check a GLB version against a real chronicle log before publishing it: are the logged positions on
the mesh, and how often would chronicle's highest-hit floor probe put a unit on a roof/canopy/bridge.

  .venv/bin/python tools/check_log_positions.py maps/zul-gurub/renders/vNNN-glb \
      --instance OJbOLvyr1pXA3AX9 [--host <one of local.yaml log_hosts>] [--map 309]
  .venv/bin/python tools/check_log_positions.py <version dir> --stream unit_position.bin

Version paths are relative to the current directory or to the workdir (local.yaml; tools/rmconfig.py).

Prints the chronicle manifest `mesh` entry (bounds = height.json `frame_world`), the share of samples
inside it, whether the log carries z, the top-surface-minus-local-floor table (the roof/canopy risk
of the no-z fallback), and, when z is present, logged z against the top surface.

Both kinds: terrain bounds = height.json `frame_world` (true world coords); WMO bounds = `bounds_wow`
with both horizontals negated (the WMO OBJ is in the pipeline frame = world turned 180 deg, so a WMO
height.png maps the NEGATED log x/y). height.png is the passes' camera: the frame span x 1.02 about
its centre (blender_topdown `ortho_scale`), so 1% margin per side. height.png is decoded at full 16 bit here: Pillow
silently keeps only the high byte of 16-bit RGBA (~1.2 yd steps on Zul'Gurub). Takes ~25 s.
height.png grey is sRGB-ENCODED (Blender's view transform), not the linear ramp height.json
describes for versions before 2026-10-18: grey is linearised before mapping to z. Versions whose
height.json `encoding` starts with "linear" (export_glb since 2026-10-18) are read as-is.
Verified on the ZG reference log: linearised, logged z - top surface has median 0.0 yd.
"""
import argparse, gzip, json, struct, sys, urllib.request, zlib
from collections import Counter
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rmconfig  # noqa: E402

UA = "Mozilla/5.0 (Macintosh) Chrome/130"


def fetch_stream(host, instance):
    # The API answers non-browser requests with 403 "only browser requests ... allowed".
    url = f"https://{host}/api/v1/raidlogs/instances/{instance}/events/unit_position"
    req = urllib.request.Request(url, headers={
        "Origin": f"https://{host}", "Referer": f"https://{host}/instances/{instance}",
        "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "User-Agent": UA})
    return urllib.request.urlopen(req).read()


def varint(b, o):
    r = s = 0
    while True:
        c = b[o]; o += 1; r |= (c & 0x7F) << s; s += 7
        if c < 0x80: return r, o


def fields(b):
    o = 0; out = {}
    while o < len(b):
        k, o = varint(b, o); f, t = k >> 3, k & 7
        if t == 0: v, o = varint(b, o)
        elif t == 1: v = struct.unpack("<d", b[o:o + 8])[0]; o += 8
        elif t == 5: v = struct.unpack("<f", b[o:o + 4])[0]; o += 4
        elif t == 2: n, o = varint(b, o); v = b[o:o + n]; o += n
        else: raise ValueError(f"wire type {t}")
        out.setdefault(f, v)
    return out


def decode_positions(raw):
    """Stream = repeated (encounter id, first ts, count, length) headers, each followed by
    varint-delimited UnitPosition protos: 2 unit, 3 x, 4 y, 5 map_id, 6 facing, 7 optional z."""
    if raw[:2] == b"\x1f\x8b": raw = gzip.decompress(raw)
    o = 0; rows = []
    while o < len(raw):
        n, o = varint(raw, o); enc = raw[o:o + n].decode(); o += n
        _, o = varint(raw, o); _, o = varint(raw, o); dl, o = varint(raw, o)
        d = raw[o:o + dl]; o += dl; p = 0
        while p < len(d):
            m, p = varint(d, p); f = fields(d[p:p + m]); p += m
            rows.append((enc, f.get(3, 0.0), f.get(4, 0.0), f.get(5, 0), f.get(7)))
    return rows


def read_png16(path):
    """Non-interlaced PNG -> uint16 (h, w, channels), all five row filters."""
    b = Path(path).read_bytes(); o = 8; idat = []; hdr = None
    while o < len(b):
        n = struct.unpack(">I", b[o:o + 4])[0]; t = b[o + 4:o + 8]; d = b[o + 8:o + 8 + n]; o += 12 + n
        if t == b"IHDR": hdr = struct.unpack(">IIBBBBB", d)
        elif t == b"IDAT": idat.append(d)
    w, h, bd, ct, _, _, il = hdr
    if il: sys.exit(f"{path}: interlaced PNG not supported")
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[ct]; bpp = max(1, ch * bd // 8); stride = w * ch * bd // 8
    raw = np.frombuffer(zlib.decompress(b"".join(idat)), np.uint8).reshape(h, stride + 1)
    out = np.zeros((h, stride), np.int16); prev = np.zeros(stride, np.int16)
    for r in range(h):
        f = raw[r, 0]; x = raw[r, 1:].astype(np.int16)
        if f == 0: cur = x
        elif f == 2: cur = (x + prev) & 255
        else:  # 1 sub, 3 average, 4 paeth: sequential per pixel, vectorised over its bytes
            cur = x.copy(); xs = x.reshape(-1, bpp); ps = prev.reshape(-1, bpp); cs = cur.reshape(-1, bpp)
            a = c = np.zeros(bpp, np.int16)
            for i in range(len(xs)):
                up = ps[i]
                if f == 1: pr = a
                elif f == 3: pr = (a + up) >> 1
                else:
                    p = a + up - c; pa = np.abs(p - a); pb = np.abs(p - up); pc = np.abs(p - c)
                    pr = np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, up, c))
                a = cs[i] = (xs[i] + pr) & 255; c = up
        out[r] = cur; prev = cur
    px = out.astype(np.uint16).reshape(h, w, -1)
    return (px[..., 0::2] << 8) | px[..., 1::2] if bd == 16 else px


def box_min(a, size):
    h = size // 2; p = np.pad(a, h, mode="edge"); r = p.copy()
    for s in range(1, 2 * h + 1): r[:, :-s] = np.minimum(r[:, :-s], p[:, s:])
    c = r.copy()
    for s in range(1, 2 * h + 1): c[:-s, :] = np.minimum(c[:-s, :], r[s:, :])
    return c[:a.shape[0], :a.shape[1]]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("version", help="maps/<slug>/renders/vNNN-*glb* folder (height.json, height.png)")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--instance", help="chronicle instance id (public log)")
    src.add_argument("--stream", help="a saved unit_position stream (gzip or raw)")
    ap.add_argument("--host", default=(rmconfig.CFG["log_hosts"] or [None])[0],
                    help="chronicle host serving the log (default: the first of local.yaml log_hosts)")
    ap.add_argument("--map", type=int, help="only samples with this map id (default: the most common)")
    ap.add_argument("--radius", type=float, default=4.0, help="local-floor radius, yd (default 4)")
    ap.add_argument("--linear", action="store_true", help="height.png grey is already linear (not sRGB)")
    a = ap.parse_args()

    vdir = rmconfig.version_dir(a.version); hj = json.loads((vdir / "height.json").read_text())
    terrain = "frame_world" in hj
    if terrain:
        (x0, y0), (x1, y1) = hj["frame_world"]["min"], hj["frame_world"]["max"]
    else:  # WMO: chronicle bounds = bounds_wow with both horizontals negated (README "3D export")
        lo, hi = hj["bounds_wow"]["min"], hj["bounds_wow"]["max"]; x0, x1, y0, y1 = -hi[0], -lo[0], -hi[1], -lo[1]
    z0, z1 = hj["height"]["z_min"], hj["height"]["z_max"]
    print("manifest mesh entry (path is set by the Map Foundry):")
    print(json.dumps({"bounds": {"minX": round(x0, 4), "maxX": round(x1, 4), "minY": round(y0, 4), "maxY": round(y1, 4)},
                      "zMin": round(z0, 4), "zMax": round(z1, 4), "frame": "wow-yup-mirrored-x"}))

    rows = decode_positions(Path(a.stream).read_bytes() if a.stream else fetch_stream(a.host, a.instance))
    maps = Counter(r[3] for r in rows); mid = a.map if a.map is not None else maps.most_common(1)[0][0]
    rows = [r for r in rows if r[3] == mid]
    inside = [r for r in rows if x0 <= r[1] <= x1 and y0 <= r[2] <= y1]
    with_z = [r for r in inside if r[4] is not None]
    print(f"samples: {len(rows)} on map {mid} (maps in stream: {dict(maps)}), "
          f"{len(set(r[0] for r in rows))} encounters")
    print(f"inside bounds: {len(inside)}/{len(rows)} ({100 * len(inside) / max(1, len(rows)):.1f}%)")
    print(f"with z: {len(with_z)}/{len(inside)}" + ("" if with_z else
          "  <- no z: parsed before chronicle #1156, or the source has none; a reparse adds it"))
    if not inside: return

    rot = hj["height"].get("rot")
    if rot not in (-90, 90): sys.exit(f"height.rot {rot}: only -90 (north up) and 90 (south up) are mapped")
    img = read_png16(vdir / "height.png"); grey = img[..., 0].astype(np.float64); H, W = grey.shape
    alpha = img[..., -1] if img.shape[-1] in (2, 4) else np.full_like(img[..., 0], 1)
    v = grey / 65535.0
    linear = a.linear or hj["height"].get("encoding", "").startswith("linear")
    print(f"height.png encoding: {'linear' if linear else 'sRGB (pre-2026-10-18 export)'}")
    if not linear: v = np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
    top = z0 + v * (z1 - z0)
    xs = np.array([r[1] for r in inside]); ys = np.array([r[2] for r in inside])
    # camera frame in the OBJ's own coords: terrain = world, WMO = pipeline (both horizontals negated)
    if terrain: fx0, fx1, fy0, fy1, sx, sy = x0, x1, y0, y1, xs, ys
    else: fx0, fx1, fy0, fy1, sx, sy = lo[0], hi[0], lo[1], hi[1], -xs, -ys
    m = 0.01  # blender_topdown: ortho_scale = 1.02 x the larger span, resolution keeps the aspect
    mx, my = m * (fx1 - fx0), m * (fy1 - fy0); fx0, fx1, fy0, fy1 = fx0 - mx, fx1 + mx, fy0 - my, fy1 + my
    if rot == -90:  # +x up, -y right (terrain: north up, east right)
        row = (fx1 - sx) / (fx1 - fx0) * H; col = (fy1 - sy) / (fy1 - fy0) * W
    else:           # -x up, +y right
        row = (sx - fx0) / (fx1 - fx0) * H; col = (sy - fy0) / (fy1 - fy0) * W
    row = np.clip(row.astype(int), 0, H - 1); col = np.clip(col.astype(int), 0, W - 1)
    on = alpha[row, col] > 0
    print(f"on geometry (height.png alpha): {on.mean() * 100:.1f}%")
    px_per_yd = H / (fx1 - fx0)
    floor = box_min(np.where(alpha > 0, top, np.inf), int(2 * a.radius * px_per_yd) + 1)
    d = (top - floor)[row, col][on]
    print(f"top surface minus lowest floor within {a.radius:g} yd (roof/canopy/bridge/step risk "
          f"for the highest-hit fallback): >3 yd {(d > 3).mean() * 100:.1f}%  "
          f">8 yd {(d > 8).mean() * 100:.1f}%  >20 yd {(d > 20).mean() * 100:.1f}%")
    if with_z:
        zi = np.array([r[4] if r[4] is not None else np.nan for r in inside])[on]
        dz = (zi - top[row, col][on]); dz = dz[~np.isnan(dz)]
        print(f"logged z minus top surface: median {np.median(dz):+.1f} yd, |dz|<=3 yd {(np.abs(dz) <= 3).mean() * 100:.1f}%, "
              f"under something (dz < -5) {(dz < -5).mean() * 100:.1f}%, above top (dz > 5) {(dz > 5).mean() * 100:.1f}%")
        print("  (median ~0 and few 'above top' = mesh and log share one z frame; 'under something' = units\n"
              "   beneath roofs/canopies/bridges, which the highest-hit fallback would lift onto them)")


if __name__ == "__main__":
    main()
