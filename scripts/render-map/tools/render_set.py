"""Render one VERSIONED set of top-down passes for a map.

  .venv/bin/python -I tools/render_set.py <slug> <label> [--width 2400] [--note "..."]
      [--skip-shaded] [--no-selfcheck] [--blender-args "..."]

Reads maps/<slug>/map.yaml (rot, optional reference image) and maps/<slug>/fetch.json
(must exist: run tools/fetch_map.py <slug> first). A `terrain` fetch (ADT map) is stitched
from Blizzard's minimap tiles instead of rendered: textured.png (native, tile_px per tile),
previews, manifest with the pixel->world transform. No dry/water/shaded passes exist for it.

Creates maps/<slug>/renders/vNNN-<label>/ (NNN = next free number; nothing is ever
overwritten) with:
  dry.png            albedo, no water            (blender_topdown.py --no-liquid)
  water.png          depth-tested water mask     (blender_topdown.py --water-mask)
  shaded.png         lit pass, no water          (blender_topdown.py --shaded --no-liquid)
  textured.png       dry + water tint            (composite_water.py)
  shaded-water.png   shaded + water tint         (composite_water.py)
  *-aligned.png      every pass registered onto the reference frame (align_to_real.py),
                     only when map.yaml has `reference:`
  align.json         src px -> reference px matrix + IoU
  preview-*.webp     1600 px shareable previews, each <= 1 MB (preview.py; previews.json)
  --glb adds (export_glb.py; Blizzard-derived, gitignored like the images):
  <slug>-open-top.glb  cutaway 3D model: ceilings/vault/upper walls removed by the support cull
  <slug>-full.glb      every face, only with --glb-full
  height.png           16-bit top-down elevation, same camera frame as the passes (height.json)
  perspective-*.png    3/4 proof renders from the re-imported GLB (+ previews)
  log.txt            everything the tools printed
  manifest.json      when, Blender version, sha256 of every tool script and of the OBJ, the
                     fetch provenance (build, FileDataIDs), exact command lines, per-output
                     sha256 + alpha coverage, the self-check result, your note

Self-check (default on): the dry pass is rendered twice at 600 px before the real run and the
two renders must have identical PIXELS (file bytes differ: Blender stamps PNG metadata).
That is the determinism guarantee, measured, every time.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rmconfig  # noqa: E402
ROOT = rmconfig.workdir()  # maps/, cache/, data/ (local.yaml `workdir`)
BLENDER = rmconfig.expand(rmconfig.CFG["blender"])
BLENDER_PINNED = "Blender 4.3"  # major.minor the tools were validated on
TOOLS = ["blender_topdown.py", "composite_water.py", "align_to_real.py", "wmo2obj.py", "adt2obj.py", "fetch_map.py", "mpq_chain.py",
         "render_set.py", "preview.py", "export_glb.py", "m2obj.py", "m2fetch.py", "rmconfig.py"]


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pixel_sha(path):
    """sha256 of the decoded pixels: Blender's PNGs carry per-run metadata, so file hashes differ."""
    from PIL import Image
    return hashlib.sha256(Image.open(path).tobytes()).hexdigest()


def coverage(path):
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    hist = im.getchannel("A").histogram()
    return round(100 * sum(hist[1:]) / (im.width * im.height), 3)


def next_dir(mdir, label):
    rd = os.path.join(mdir, "renders")
    os.makedirs(rd, exist_ok=True)
    nums = [int(m.group(1)) for d in os.listdir(rd) if (m := re.match(r"v(\d{3})-", d))]
    n = max(nums, default=-1) + 1
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    d = os.path.join(rd, "v%03d-%s" % (n, slug))
    os.makedirs(d)
    return d


def stitch_minimap(fetch, mdir, out_path, bg="12,17,20"):
    """Stitch the crop's minimap tiles onto a flat background (align_to_real.py's 'real' input)."""
    from PIL import Image
    sel = {tuple(t) for t in (fetch.get("crop_tiles") or [[t["x"], t["y"]] for t in fetch["tiles"]])}
    tiles = [t for t in fetch["tiles"] if (t["x"], t["y"]) in sel]
    tp = fetch["tile_px"]
    x0, y0 = min(t["x"] for t in tiles), min(t["y"] for t in tiles)
    W = (max(t["x"] for t in tiles) - x0 + 1) * tp
    H = (max(t["y"] for t in tiles) - y0 + 1) * tp
    canvas = Image.new("RGB", (W, H), tuple(int(c) for c in bg.split(",")))
    for t in tiles:
        im = Image.open(os.path.join(mdir, "raw", "minimap", "%02d_%02d.png" % (t["x"], t["y"]))).convert("RGB")
        canvas.paste(im, ((t["x"] - x0) * tp, (t["y"] - y0) * tp))
    canvas.save(out_path)


def render_terrain(a, cfg, mdir, fetch):
    """Stitch Blizzard's minimap tiles. Native resolution is tile_px per 533.33 yards; --width
    only DOWNscales (upscaling minimaps invents nothing). Deterministic: pure Pillow."""
    from PIL import Image
    tiles = fetch["tiles"]
    tp = fetch["tile_px"]
    x0, x1 = fetch["tile_range"]["x"]
    y0, y1 = fetch["tile_range"]["y"]
    W, H = (x1 - x0 + 1) * tp, (y1 - y0 + 1) * tp
    out = next_dir(mdir, a.label)
    rel = lambda p: os.path.relpath(p, ROOT)
    print("stitching %d minimap tiles into %dx%d -> %s" % (len(tiles), W, H, rel(out)), file=sys.stderr)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for t in tiles:
        im = Image.open(os.path.join(mdir, "raw", "minimap", "%02d_%02d.png" % (t["x"], t["y"]))).convert("RGBA")
        canvas.paste(im, ((t["x"] - x0) * tp, (t["y"] - y0) * tp))
    # the same camera convention as the WMO passes: image up = WoW +X (north), image right = WoW -Y (east)
    native = os.path.join(out, "textured.png")
    canvas.save(native)
    outputs_note = "native"
    if a.width < W:
        small = canvas.resize((a.width, round(H * a.width / W)), Image.LANCZOS)
        small.save(os.path.join(out, "textured-%dpx.png" % a.width))
        outputs_note = "native + %dpx downscale" % a.width
    elif a.width > W:
        print("  --width %d > native %d: minimaps cannot be upscaled meaningfully; kept native" % (a.width, W),
              file=sys.stderr)
    py = rmconfig.CFG["python"] and rmconfig.expand(rmconfig.CFG["python"]) or sys.executable
    subprocess.run([py, "-I", os.path.join(HERE, "preview.py"), out, "--width", str(a.preview_width),
                    "--max-bytes", str(a.preview_max_bytes)], check=True)
    previews = json.load(open(os.path.join(out, "previews.json")))
    yards = fetch["tile_yards"]
    outputs = {n: {"sha256_pixels": pixel_sha(os.path.join(out, n)), "sha256_file": sha(os.path.join(out, n)),
                   "alpha_coverage_pct": coverage(os.path.join(out, n))}
               for n in sorted(os.listdir(out)) if n.endswith(".png")}
    manifest = {
        "version": os.path.basename(out), "map": a.slug, "label": a.label, "note": a.note,
        "created": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "engine": "minimap-stitch (Blizzard minimap tiles; doodads, WMOs, water, shading baked in)",
        "python": py, "map_yaml": cfg,
        "fetch": {k: fetch[k] for k in ("fetched", "product", "region", "build", "wdt_fid", "casclib_commit", "kind")},
        "tiles": len(tiles), "tile_px": tp, "size": [W, H], "outputs_note": outputs_note,
        "world_transform": {
            "description": "pixel (px, py) in textured.png -> WoW world (x, y). Tile (tx, ty) top-left corner is "
                           "world x = (32 - ty) * 533.33, y = (32 - tx) * 533.33; image right = -y, image down = -x.",
            "x0_tile": x0, "y0_tile": y0, "px_per_yard": tp / yards,
            "world_x_of_py": "(32 - %d) * %.5f - py / %.5f" % (y0, yards, tp / yards),
            "world_y_of_px": "(32 - %d) * %.5f - px / %.5f" % (x0, yards, tp / yards),
        },
        "tools": {t: sha(os.path.join(HERE, t)) for t in TOOLS},
        "args": vars(a), "outputs": outputs, "previews": previews["previews"],
    }
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=2)
    print("done: %s  (%dx%d, %.2f px/yard)" % (rel(out), W, H, tp / yards), file=sys.stderr)
    for n, o in outputs.items():
        print("  %-26s coverage %6.2f%%  px %s" % (n, o["alpha_coverage_pct"], o["sha256_pixels"][:12]), file=sys.stderr)
    print(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("label")
    ap.add_argument("--width", type=int, default=2400)
    ap.add_argument("--note", default="")
    ap.add_argument("--skip-shaded", action="store_true")
    ap.add_argument("--no-selfcheck", action="store_true")
    ap.add_argument("--blender-args", default="", help="extra flags for every blender_topdown.py call")
    ap.add_argument("--m2", action="store_true",
                    help="terrain maps: also place M2 doodads (MDDF) — fetches raw/m2 once, builds raw/obj-m2/<slug>.obj")
    ap.add_argument("--m2-yaw", type=float, default=180.0, help="with --m2: yaw offset in degrees (fitted: 180)")
    ap.add_argument("--allow-blender-drift", action="store_true")
    ap.add_argument("--preview-width", type=int, default=1600)
    ap.add_argument("--preview-max-bytes", type=int, default=1_000_000)
    ap.add_argument("--glb", action="store_true", help="also export the 3D model + height map (export_glb.py)")
    ap.add_argument("--glb-full", action="store_true", help="with --glb: also the uncut <slug>-full.glb")
    ap.add_argument("--glb-format", default="WEBP", choices=["AUTO", "JPEG", "WEBP"],
                    help="embedded texture format; WEBP (EXT_texture_webp, ~4x smaller) for web viewers, AUTO = PNG")
    ap.add_argument("--glb-args", default="", help="extra flags for export_glb.py (cull knobs: --wall-cap 8 ...)")
    a = ap.parse_args()

    mdir = os.path.join(ROOT, "maps", a.slug)
    cfg = yaml.safe_load(open(os.path.join(mdir, "map.yaml")))
    fetch_json = os.path.join(mdir, "fetch.json")
    if not os.path.exists(fetch_json):
        raise SystemExit("no %s — run: tools/fetch_map.py %s" % (os.path.relpath(fetch_json, ROOT), a.slug))
    fetch = json.load(open(fetch_json))
    if fetch.get("kind") == "terrain" and not fetch.get("obj"):
        if a.glb:
            raise SystemExit("--glb needs an OBJ; this terrain map has only minimap tiles (fetch again with ADTs)")
        return render_terrain(a, cfg, mdir, fetch)
    obj = os.path.join(mdir, "raw", fetch["obj"])
    m2info = None
    if a.m2:
        if fetch.get("kind") != "terrain":
            raise SystemExit("--m2 is for terrain maps (MDDF in the ADTs); WMO maps carry doodads in MODD, not built")
        if a.glb:
            raise SystemExit("--m2 with --glb is not supported yet (the GLB export culls floor from the WMO mesh)")
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "m2fetch.py"), a.slug], check=True)
        m2obj_path = os.path.join(mdir, "raw", "obj-m2", a.slug + ".obj")
        os.makedirs(os.path.dirname(m2obj_path), exist_ok=True)
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "adt2obj.py"), mdir, "--out", m2obj_path,
                        "--chunk-px", str(cfg.get("atlas_chunk_px", 128)), "--m2", "--m2-yaw", str(a.m2_yaw)],
                       check=True, stderr=subprocess.DEVNULL)
        obj = m2obj_path
        m2info = {"yaw_offset_deg": a.m2_yaw, "stats": json.load(open(os.path.splitext(obj)[0] + ".stats.json")),
                  "frame": "terrain+WMO+water bounds only (--frame-exclude-prefix m2_)",
                  "limits": "rest pose, first texture only, blend>=3 parts skipped, no two-sided flag"}
    rot = str(cfg.get("rot", 90))
    reference = cfg.get("reference")
    if reference:
        reference = os.path.normpath(os.path.join(mdir, reference))
        if not os.path.exists(reference):
            raise SystemExit("map.yaml reference not found: " + reference)

    bl_ver = subprocess.run([BLENDER, "--version"], capture_output=True, text=True).stdout.splitlines()[0]
    if not bl_ver.startswith(BLENDER_PINNED) and not a.allow_blender_drift:
        raise SystemExit("Blender is '%s', tools were validated on '%s'. Pass --allow-blender-drift after "
                         "checking a self-check + a known map still match." % (bl_ver, BLENDER_PINNED))

    out = next_dir(mdir, a.label)
    if fetch.get("kind") == "terrain":
        # Blizzard's minimap of the same tiles is the reference: the alignment IoU verifies the terrain transform
        reference = os.path.join(out, "minimap.png")
        stitch_minimap(fetch, mdir, reference, bg=str(cfg.get("reference_bg", "12,17,20")))
        cfg = dict(cfg, reference="minimap.png (stitched into this version folder)")
    log = os.path.join(out, "log.txt")
    rel = lambda p: os.path.relpath(p, ROOT)
    py = rmconfig.CFG["python"] and rmconfig.expand(rmconfig.CFG["python"]) or sys.executable
    frame = []  # given to blender_topdown.py AND export_glb.py, so height.png shares the passes' frame
    if a.m2:
        frame += ["--frame-exclude-prefix", "m2_"]  # doodads must not move the camera frame
    if fetch.get("kind") == "terrain":
        frame += ["--smooth-prefix", "terrain_"]  # heightmap: weld + smooth normals, no per-triangle facets
        if cfg.get("crop"):
            frame += ["--frame-include-prefix", "terrain_"]  # a WMO reaching out of the crop must not widen the frame
    extra = a.blender_args.split() + frame
    cmds = []

    def run(cmd, must_write=None):
        print("  $ " + " ".join(rel(c) if str(c).startswith(ROOT) else str(c) for c in cmd), file=sys.stderr)
        with open(log, "a") as lf:
            lf.write("$ " + " ".join(cmd) + "\n")
            r = subprocess.run(cmd, cwd=ROOT, stdout=lf, stderr=subprocess.STDOUT)
        if r.returncode != 0 or (must_write and not os.path.exists(must_write)):
            raise SystemExit("step failed (see %s): %s" % (rel(log), " ".join(cmd)))
        cmds.append(" ".join(rel(c) if str(c).startswith(ROOT) else str(c) for c in cmd))

    def blender(outpath, width, *flags):
        run([BLENDER, "-b", "-P", os.path.join(HERE, "blender_topdown.py"), "--",
             "--obj", obj, "--out", outpath, "--width", str(width), "--rot", rot, *flags, *extra],
            must_write=outpath)

    print("rendering into " + rel(out), file=sys.stderr)

    # 0. determinism self-check
    selfcheck = {"enabled": not a.no_selfcheck}
    if not a.no_selfcheck:
        p1, p2 = os.path.join(out, ".selfcheck-1.png"), os.path.join(out, ".selfcheck-2.png")
        blender(p1, 600, "--no-liquid")
        blender(p2, 600, "--no-liquid")
        s1, s2 = pixel_sha(p1), pixel_sha(p2)
        selfcheck.update({"width": 600, "pixel_sha256_run1": s1, "pixel_sha256_run2": s2, "identical": s1 == s2})
        os.remove(p1)
        os.remove(p2)
        if s1 != s2:
            raise SystemExit("SELF-CHECK FAILED: two identical dry renders differ — renderer is not "
                             "deterministic on this machine. Not continuing.")
        print("  self-check: two 600px renders identical (%s)" % s1[:12], file=sys.stderr)

    # 1. passes
    blender(os.path.join(out, "dry.png"), a.width, "--no-liquid")
    blender(os.path.join(out, "water.png"), a.width, "--water-mask")
    if not a.skip_shaded:
        blender(os.path.join(out, "shaded.png"), a.width, "--shaded", "--no-liquid")

    # 2. water composites (radii tuned at 2400 px)
    comp = os.path.join(HERE, "composite_water.py")
    pxs = ["--px-scale", "%.4f" % (a.width / 2400)]
    if cfg.get("water_tint") is not None:  # map.yaml: tint strength 0..1 (default 0.42)
        pxs += ["--tint", str(cfg["water_tint"])]
    if cfg.get("water_color"):  # map.yaml: "r,g,b" (default 78,150,196)
        pxs += ["--color", str(cfg["water_color"])]
    run([py, "-I", comp, "--dry", os.path.join(out, "dry.png"), "--water", os.path.join(out, "water.png"),
         "--out", os.path.join(out, "textured.png"), *pxs], must_write=os.path.join(out, "textured.png"))
    if not a.skip_shaded:
        run([py, "-I", comp, "--dry", os.path.join(out, "shaded.png"), "--water", os.path.join(out, "water.png"),
             "--out", os.path.join(out, "shaded-water.png"), *pxs], must_write=os.path.join(out, "shaded-water.png"))

    # 3. registration onto the reference frame
    align = None
    if reference:
        also = [os.path.join(out, n) for n in ("dry.png", "water.png", "shaded.png", "shaded-water.png")
                if os.path.exists(os.path.join(out, n))]
        run([py, "-I", os.path.join(HERE, "align_to_real.py"), "--src", os.path.join(out, "textured.png"),
             "--real", reference, "--bg", str(cfg.get("reference_bg", "12,17,20")),
             "--out", os.path.join(out, "textured-aligned.png"), "--also", *also],
            must_write=os.path.join(out, "textured-aligned.png"))
        os.replace(os.path.join(out, "textured-aligned.json"), os.path.join(out, "align.json"))
        align = json.load(open(os.path.join(out, "align.json")))

    # 4. 3D export: open-top GLB + height map + perspective proofs (same OBJ, same rot, same frame)
    glb = None
    if a.glb:
        gl = [BLENDER, "-b", "-P", os.path.join(HERE, "export_glb.py"), "--", "--obj", obj, "--outdir", out,
              "--slug", a.slug, "--rot", rot, "--image-format", a.glb_format, "--height-width", str(a.width)]
        if fetch.get("kind") == "terrain":
            gl += ["--kind", "terrain", *frame]  # same frame as the passes; open-sky cull (export_glb.py docstring)
        gl += a.glb_args.split()
        if not a.glb_full:
            gl.append("--skip-full")
        run(gl, must_write=os.path.join(out, "%s-open-top.glb" % a.slug))
        glb = json.load(open(os.path.join(out, "height.json")))
        glb["files"] = {n: {"bytes": os.path.getsize(os.path.join(out, n)), "sha256_file": sha(os.path.join(out, n))}
                        for n in sorted(os.listdir(out)) if n.endswith(".glb")}

    # 5. small previews (<= 1 MB each, WebP)
    sources = ["textured.png", "shaded-water.png", "dry.png"] + (
        ["perspective-open-top.png", "perspective-full.png", "height.png"] if a.glb else [])
    run([py, "-I", os.path.join(HERE, "preview.py"), out, "--width", str(a.preview_width),
         "--max-bytes", str(a.preview_max_bytes), "--sources", *sources], must_write=os.path.join(out, "previews.json"))
    previews = json.load(open(os.path.join(out, "previews.json")))

    # 6. manifest
    outputs = {n: {"sha256_pixels": pixel_sha(os.path.join(out, n)), "sha256_file": sha(os.path.join(out, n)),
                   "alpha_coverage_pct": coverage(os.path.join(out, n))}
               for n in sorted(os.listdir(out)) if n.endswith(".png")}
    manifest = {
        "version": os.path.basename(out), "map": a.slug, "label": a.label, "note": a.note,
        "created": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "blender": bl_ver, "python": py,
        "map_yaml": cfg,
        "fetch": {k: fetch.get(k) for k in ("fetched", "product", "region", "build", "wdt_fid", "root_fid",
                                            "casclib_commit", "source", "client", "root", "stormlib_commit")
                  if k in fetch},
        "obj": {"path": rel(obj), "sha256": sha(obj)},
        "m2": m2info,
        "tools": {t: sha(os.path.join(HERE, t)) for t in TOOLS},
        "args": vars(a), "selfcheck": selfcheck, "commands": cmds, "align": align, "outputs": outputs,
        "glb": glb, "previews": previews["previews"],
    }
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=2)
    print("done: %s%s" % (rel(out), "  (IoU vs reference %.4f)" % align["iou"] if align else ""), file=sys.stderr)
    for n, o in outputs.items():
        print("  %-26s coverage %6.2f%%  px %s" % (n, o["alpha_coverage_pct"], o["sha256_pixels"][:12]), file=sys.stderr)
    print(out)


main()
