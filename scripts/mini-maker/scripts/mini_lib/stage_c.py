"""Stage C — Meshy submission + the mesh-review gate."""
from __future__ import annotations

import datetime
import os
import time

from . import gate, meshy

PASS_CRITERIA = """Pass criteria for a mesh (MESHY.md, the operator's gate):
  - one connected shell, base attached
  - recognisable silhouette from front and side
  - no fused limbs, no missing weapon, no paper-thin sheet
  - back is plausible, not a smeared mirror of the front"""


def submit_hero(slug, api_key, *, root="work", overrides=None,
                 transport=None, download=None, poll_interval=5, poll_timeout=900,
                 meshy_log_path="meshy-tests/LOG.md", matrix_row="production"):
    """Live Stage C for a stills_approved slug. Raises gate.GateError if the
    gate isn't open, meshy.MeshyTaskError naming the task id on failure.
    Returns the updated meta dict.
    """
    meta = gate.load_meta(slug, root)
    gate.require_stage(
        meta, slug, "stills_status", gate.STILLS_APPROVED,
        f"python3.12 scripts/mini.py approve --dungeon {os.path.basename(root)} --only {slug} --stage stills",
    )

    out_dir = gate.out_dir(slug, root)
    views = meta["views"]
    image_paths = [os.path.join(out_dir, f"{v}.png") for v in views]
    image_bytes = []
    for p in image_paths:
        with open(p, "rb") as f:
            image_bytes.append(f.read())

    path, task_id, body = meshy.create_task(image_bytes, api_key, overrides=overrides, transport=transport)
    result = meshy.poll_task(path, task_id, api_key, transport=transport,
                              interval=poll_interval, timeout=poll_timeout)

    mesh_dir = os.path.join(out_dir, "mesh")
    os.makedirs(mesh_dir, exist_ok=True)
    download = download or meshy.download_transport
    model_urls = result.get("model_urls", {})
    downloaded = {}
    for fmt in ("glb", "stl"):
        url = model_urls.get(fmt)
        if not url:
            continue
        raw = download(url)
        dest = os.path.join(mesh_dir, f"raw.{fmt}")
        with open(dest, "wb") as f:
            f.write(raw)
        downloaded[fmt] = {"path": dest, "bytes": len(raw)}

    credits = result.get("consumed_credits")
    meta["meshy"] = {
        "task_id": task_id,
        "endpoint": path,
        "settings": {k: v for k, v in body.items() if k not in ("image_url", "image_urls")},
        "images_sent": views,
        "credits_billed": credits,
        "created_at": result.get("created_at"),
        "started_at": result.get("started_at"),
        "finished_at": result.get("finished_at"),
        "downloaded": downloaded,
    }
    meta["mesh_status"] = gate.MESH_PENDING
    meta["mesh_approved_by"] = None
    meta["mesh_approved_at"] = None
    gate.save_meta(slug, meta, root)

    gate.append_meshy_log(
        {
            "date": datetime.date.today().isoformat(),
            "hero": slug,
            "matrix_row": matrix_row,
            "images_sent": "+".join(views),
            "settings_delta": "(production defaults)",
            "credits": credits,
            "verdict": "pending review",
            "notes": f"task {task_id}",
        },
        path=meshy_log_path,
    )
    return meta
