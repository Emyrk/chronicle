"""Make the calibrated 2D render chronicle shows beside a mesh (Map Foundry `renders` layer): a pass of
a version, cut to EXACTLY the mesh bounds and turned to chronicle's convention, plus its manifest entry.

  .venv/bin/python -I tools/chronicle_render.py maps/<slug>/renders/vNNN-*glb* [--pass shaded-water.png]
      [--width 2400] [--stream unit_position.bin] [--source maps/<slug>/renders/vMMM-*/] [--floor N]

Paths are relative to the current directory or to the workdir (local.yaml; tools/rmconfig.py).
Writes maps/<slug>/published/<map_id>-<slug>[-floor-N]-<version>-<pass>-<width>.png (gitignored)
and prints a legacy map-level or floor-level Foundry instance entry.

Why not just downscale the pass (what Zul'Gurub's first publish did): blender_topdown frames the camera at
1.02 x the larger span (1% margin per side), so a pass registered to the mesh bounds is 2% too small.
Chronicle (`renderedDungeonMapPoint`) draws north up, west left: top = (maxX - x), left = (maxY - y).
A terrain pass with rot -90 already is that; a WMO pass is in the pipeline frame (both horizontals
negated = world turned 180 deg), so it is turned 180 deg. --source takes the pass from another version of
the same map (e.g. a 4x set), refused unless both log.txt camera frames ("bounds lo=… hi=…") match. --stream checks the result the way chronicle
will place units: the share of log samples that land on opaque pixels.
"""
import argparse, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
import yaml

Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, str(Path(__file__).resolve().parent))
import floor_config  # noqa: E402
import rmconfig  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("version")
    ap.add_argument("--pass", dest="src", default="shaded-water.png")
    ap.add_argument("--width", type=int, default=2400)
    ap.add_argument("--stream", help="saved unit_position stream: check placement on the output")
    ap.add_argument("--source", help="version dir to take the pass from (same camera frame and floor, checked)")
    ap.add_argument("--floor", type=int, help="floor identifier override (normally read from the version manifest)")
    a = ap.parse_args()
    vdir = rmconfig.version_dir(a.version); hj = json.loads((vdir / "height.json").read_text())
    slug = vdir.parent.parent.name
    cfg = yaml.safe_load((vdir.parent.parent / "map.yaml").read_text())
    map_id = cfg.get("map_id")
    manifest_path = vdir / "manifest.json"
    recorded_floor = json.loads(manifest_path.read_text()).get("floor") if manifest_path.exists() else None
    try:
        if recorded_floor is not None:
            floor = floor_config.resolve_floor({"floor": recorded_floor["floor"]}, a.floor)
        else:
            floor = floor_config.resolve_floor(cfg, a.floor)
    except (KeyError, ValueError) as e:
        sys.exit("invalid floor metadata: " + str(e))
    if floor and (isinstance(map_id, bool) or not isinstance(map_id, int)):
        sys.exit("floor publication metadata needs integer map_id in map.yaml")
    rot = hj["height"]["rot"]
    if rot != -90: sys.exit(f"rot {rot}: only rot -90 passes are mapped")
    terrain = "frame_world" in hj
    if terrain:
        (x0, y0), (x1, y1) = hj["frame_world"]["min"], hj["frame_world"]["max"]
    else:
        lo, hi = hj["bounds_wow"]["min"], hj["bounds_wow"]["max"]; x0, x1, y0, y1 = -hi[0], -lo[0], -hi[1], -lo[1]
    sdir = rmconfig.version_dir(a.source) if a.source else vdir
    if a.source:
        frame = lambda d: next(l.split(" res=")[0] for l in (d / "log.txt").read_text().splitlines() if l.startswith("bounds lo="))
        if frame(sdir) != frame(vdir): sys.exit(f"camera frames differ: {frame(sdir)} vs {frame(vdir)}")
        source_manifest = json.loads((sdir / "manifest.json").read_text())
        source_floor = source_manifest.get("floor")
        source_floor_id = source_floor.get("floor") if source_floor else None
        floor_id = floor["floor"] if floor else None
        if source_floor_id != floor_id:
            sys.exit(f"source floor {source_floor_id} differs from mesh floor {floor_id}")
    im = Image.open(sdir / a.src).convert("RGBA")
    W, H = im.size
    # the pass covers span * 1.02 about the centre on both axes (horizontal = y span, vertical = x span)
    mx, my = 0.01 / 1.02 * W, 0.01 / 1.02 * H
    box = (mx, my, W - mx, H - my)  # symmetric, so it is the same before or after the 180 deg turn
    if not terrain: im = im.transpose(Image.Transpose.ROTATE_180)
    out_h = round(a.width * (x1 - x0) / (y1 - y0))
    out = im.resize((a.width, out_h), Image.Resampling.LANCZOS, box=box)
    vname = sdir.name.split("-")[0]; stem = Path(a.src).stem
    floor_part = f"-floor-{floor['floor']}" if floor else ""
    map_part = map_id if isinstance(map_id, int) and not isinstance(map_id, bool) else "map"
    dest = vdir.parent.parent / "published" / f"{map_part}-{slug}{floor_part}-{vname}-{stem}-{a.width}.png"
    dest.parent.mkdir(exist_ok=True); out.save(dest, optimize=True)
    print(f"wrote {dest} ({out.size[0]}x{out.size[1]}, {dest.stat().st_size / 1e6:.1f} MB) from {sdir / a.src} ({W}x{H}), "
          f"crop box {tuple(round(b, 2) for b in box)}, turned 180: {not terrain}")
    render = {"width": out.size[0], "height": out.size[1],
              "bounds": {"minX": round(x0, 4), "maxX": round(x1, 4), "minY": round(y0, 4), "maxY": round(y1, 4)}}
    print("manifest renders entry (path is set by the Map Foundry):")
    entry = (floor_config.publication_render_entry(map_id, render, floor)
             if isinstance(map_id, int) and not isinstance(map_id, bool) else render)
    print(json.dumps(entry))
    if a.stream:
        import check_log_positions as clp
        rows = clp.decode_positions(Path(a.stream).read_bytes())
        xs = np.array([r[1] for r in rows]); ys = np.array([r[2] for r in rows])
        alpha = np.asarray(out)[..., 3]; h, w = alpha.shape
        top = (x1 - xs) / (x1 - x0); left = (y1 - ys) / (y1 - y0)  # chronicle renderedDungeonMapPoint
        ok = (top >= 0) & (top <= 1) & (left >= 0) & (left <= 1)
        r = np.clip((top * h).astype(int), 0, h - 1); c = np.clip((left * w).astype(int), 0, w - 1)
        print(f"log samples on opaque pixels (chronicle placement): {(ok & (alpha[r, c] > 0)).mean() * 100:.1f}% of {len(rows)}")


if __name__ == "__main__":
    main()
