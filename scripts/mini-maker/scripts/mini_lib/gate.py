"""work/<dungeon>/<boss>/meta.json + the two review gates, and the two append-only logs.

Stage B / Stage C.3 gate semantics: a slug's stills_status and mesh_status
only ever move forward through {..._pending -> ..._approved|..._rejected} via
`set_gate`, called either by `approve` (human, gate_by="manual") or by the
`--auto` roster orchestrator (gate_by="auto") once a prior hero has been
manually approved through mesh.
"""
from __future__ import annotations

import json
import os
import shutil
import time

STILLS_PENDING = "stills_pending"
STILLS_APPROVED = "stills_approved"
STILLS_REJECTED = "stills_rejected"
MESH_PENDING = "mesh_pending"
MESH_APPROVED = "mesh_approved"
MESH_REJECTED = "mesh_rejected"


class GateError(Exception):
    pass


WORK_ROOT = "work"


def work_root(dungeon, base=WORK_ROOT):
    """A dungeon's working-state root: work/<dungeon>/ — each boss's state
    lives in work/<dungeon>/<boss>/ (pass this as `root` to everything)."""
    return os.path.join(base, dungeon)


def out_root(root="work"):
    return root


def out_dir(slug, root="work"):
    return os.path.join(out_root(root), slug)


def meta_path(slug, root="work"):
    return os.path.join(out_dir(slug, root), "meta.json")


def load_meta(slug, root="work"):
    path = meta_path(slug, root)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_meta(slug, meta, root="work"):
    meta["updated_at"] = time.time()
    path = meta_path(slug, root)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, sort_keys=True)
    os.replace(tmp, path)


def fresh_slug_dir(slug, root="work"):
    """Rerunning a slug replaces that slug's folder only."""
    d = out_dir(slug, root)
    if os.path.exists(d):
        shutil.rmtree(d)
    os.makedirs(d, exist_ok=True)
    return d


def require_stage(meta, slug, field, required_value, command_hint):
    value = meta.get(field) if meta else None
    if value != required_value:
        raise GateError(
            f"{slug} is not {required_value} (current {field}: {value!r}) — run: {command_hint}"
        )


def set_gate(meta, field, approved_value, rejected_value, *, reject, gate_by):
    meta[field] = rejected_value if reject else approved_value
    meta[f"{field.split('_')[0]}_approved_by"] = None if reject else gate_by
    meta[f"{field.split('_')[0]}_approved_at"] = None if reject else time.time()
    return meta


def any_manual_mesh_approved(base=WORK_ROOT):
    """Whether any boss in any dungeon under `work/` has been mesh_approved
    by a human — the licence --auto needs before it will touch the rest of
    a roster."""
    if not os.path.isdir(base):
        return False
    for dungeon in sorted(os.listdir(base)):
        root = os.path.join(base, dungeon)
        if not os.path.isdir(root):
            continue
        for slug in sorted(os.listdir(root)):
            meta = load_meta(slug, root)
            if meta and meta.get("mesh_status") == MESH_APPROVED and meta.get("mesh_approved_by") == "manual":
                return True
    return False


def append_cost_log(tag, model, cost, path="cost.log"):
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"{tag}\t{model}\t{cost}\n")


def append_meshy_log(row, path="meshy-tests/LOG.md"):
    """Append one row to the existing `| Date | Hero | ... |` table, keeping its format."""
    cells = [
        row.get("date", ""),
        row.get("hero", ""),
        row.get("matrix_row", ""),
        row.get("images_sent", ""),
        row.get("settings_delta", ""),
        row.get("credits", ""),
        row.get("verdict", ""),
        row.get("notes", ""),
    ]
    line = "| " + " | ".join(str(c) for c in cells) + " |\n"
    dirname = os.path.dirname(path)
    if dirname:
        os.makedirs(dirname, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(line)
