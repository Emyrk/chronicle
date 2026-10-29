"""Publish — copy a finished boss from work/<dungeon>/<boss>/ into its
dungeon folder, dungeons/<dungeon>/<boss>/, and refresh the dungeon's
stills contact sheet.

Never re-simplifies or re-compresses: every mesh is copied byte-for-byte
from what Stage D wrote. Never touches anything else already in the boss
folder (e.g. a hand-made `textured/`), and never writes meta.json.
"""
from __future__ import annotations

import os
import shutil

from . import gate

DUNGEONS_ROOT = "dungeons"
MESH_FILES = ("print.stl", "web.glb", "play.glb", "raw.glb")
CONTACT_SHEET = "stills-contact.jpg"
CONTACT_CELL = 400
CONTACT_ROWS = ("front", "back")


class PublishError(Exception):
    pass


def dungeon_dir(dungeon, root=DUNGEONS_ROOT):
    return os.path.join(root, dungeon)


def _refuse_unless_ready(dungeon, slug, meta, work_dir):
    hint = "python3.12 scripts/mini.py"
    if meta is None:
        raise PublishError(f"{slug}: no {work_dir}/meta.json — run render/mesh/compress first")
    if meta.get("mesh_status") != gate.MESH_APPROVED:
        raise PublishError(
            f"{slug}: mesh_status is {meta.get('mesh_status')!r}, not {gate.MESH_APPROVED!r} — "
            f"run: {hint} approve --dungeon {dungeon} --only {slug} --stage mesh"
        )
    if "stage_d" not in meta:
        raise PublishError(
            f"{slug}: meta.json has no stage_d result — run: {hint} compress --dungeon {dungeon} --only {slug}"
        )
    mesh_dir = os.path.join(work_dir, "mesh")
    missing = [f for f in MESH_FILES if not os.path.exists(os.path.join(mesh_dir, f))]
    views = meta.get("views") or ["front"]
    missing += [f"{v}.png" for v in views if not os.path.exists(os.path.join(work_dir, f"{v}.png"))]
    if not os.path.exists(os.path.join(work_dir, "hero.yaml")):
        missing.append("hero.yaml")
    if missing:
        raise PublishError(f"{slug}: missing in {work_dir}: {', '.join(missing)}")
    return mesh_dir, views


def publish_boss(dungeon, slug, *, work_base=gate.WORK_ROOT, dungeons_root=DUNGEONS_ROOT):
    """Copy one compressed, mesh_approved boss into dungeons/<dungeon>/<slug>/:
    print.stl, web.glb, play.glb, raw.glb, stills/<view>.png, hero.yaml.
    Raises PublishError if it isn't ready. Returns the destination dir."""
    root = gate.work_root(dungeon, work_base)
    work_dir = gate.out_dir(slug, root)
    meta = gate.load_meta(slug, root)
    mesh_dir, views = _refuse_unless_ready(dungeon, slug, meta, work_dir)

    dest = os.path.join(dungeon_dir(dungeon, dungeons_root), slug)
    stills = os.path.join(dest, "stills")
    os.makedirs(stills, exist_ok=True)
    for name in MESH_FILES:
        shutil.copyfile(os.path.join(mesh_dir, name), os.path.join(dest, name))
    for view in views:
        shutil.copyfile(os.path.join(work_dir, f"{view}.png"), os.path.join(stills, f"{view}.png"))
    shutil.copyfile(os.path.join(work_dir, "hero.yaml"), os.path.join(dest, "hero.yaml"))
    return dest


def refresh_contact_sheet(dungeon, *, dungeons_root=DUNGEONS_ROOT):
    """Rebuild dungeons/<dungeon>/stills-contact.jpg from every published
    boss folder (sorted by slug): one CONTACT_CELL-wide column per boss,
    front on top, back below. Returns the path, or None if nothing is
    published yet."""
    from PIL import Image

    ddir = dungeon_dir(dungeon, dungeons_root)
    bosses = sorted(
        d for d in os.listdir(ddir)
        if os.path.exists(os.path.join(ddir, d, "stills", "front.png"))
    )
    if not bosses:
        return None
    cell = CONTACT_CELL
    sheet = Image.new("RGB", (cell * len(bosses), cell * len(CONTACT_ROWS)), "white")
    for col, boss in enumerate(bosses):
        for row, view in enumerate(CONTACT_ROWS):
            path = os.path.join(ddir, boss, "stills", f"{view}.png")
            if not os.path.exists(path):
                continue
            with Image.open(path) as im:
                im = im.convert("RGB")
                im.thumbnail((cell, cell), Image.LANCZOS)
                x = col * cell + (cell - im.width) // 2
                y = row * cell + (cell - im.height) // 2
                sheet.paste(im, (x, y))
    out = os.path.join(ddir, CONTACT_SHEET)
    sheet.save(out, format="JPEG", quality=88)
    return out
