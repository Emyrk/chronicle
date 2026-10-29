"""import-mesh — register a raw mesh downloaded from Meshy's web UI instead
of Stage C.

Opens the mesh gate as `mesh_pending`, exactly like Stage C does — the operator still
approves with the existing `approve --stage mesh` before Stage D or
publish will touch it. Never sets `mesh_approved`.
"""
from __future__ import annotations

import hashlib
import os
import shutil

from . import gate, glbtools

STILLS_FILES = ("hero.yaml", "front.png", "back.png", "prompt.txt")


class ImportError_(Exception):
    """Named to avoid shadowing the builtin ImportError."""


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def import_mesh(slug, glb_path, *, root="work", stills_from=None):
    """Copy `glb_path` (never moved) to work/<dungeon>/<boss>/mesh/raw.glb, record an
    import block under meta.json's `meshy` key, and set mesh_status to
    mesh_pending. Optionally copies hero.yaml/stills/prompt from a sibling
    working dir. Returns the updated meta dict.
    """
    if not os.path.exists(glb_path):
        raise ImportError_(f"{slug}: {glb_path} does not exist")

    out_dir = gate.out_dir(slug, root)
    mesh_dir = os.path.join(out_dir, "mesh")
    os.makedirs(mesh_dir, exist_ok=True)

    raw_dst = os.path.join(mesh_dir, "raw.glb")
    shutil.copyfile(glb_path, raw_dst)

    triangle_count = glbtools.glb_face_count(raw_dst)
    sha256 = _sha256(raw_dst)

    meta = gate.load_meta(slug, root) or {"slug": slug}
    meshy_block = {
        "source": "meshy-web-ui",
        "original_path": os.path.abspath(glb_path),
        "sha256": sha256,
        "triangle_count": triangle_count,
    }

    if stills_from:
        copied = []
        for fname in STILLS_FILES:
            src = os.path.join(stills_from, fname)
            if os.path.exists(src):
                shutil.copyfile(src, os.path.join(out_dir, fname))
                copied.append(fname)
        meshy_block["stills_from"] = {"dir": stills_from, "files": copied}

    meta["meshy"] = meshy_block
    meta["mesh_status"] = gate.MESH_PENDING
    meta["mesh_approved_by"] = None
    meta["mesh_approved_at"] = None

    gate.save_meta(slug, meta, root)
    return meta
