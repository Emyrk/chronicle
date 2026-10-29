"""Boss portraits — painted, textured key art, separate from the mini stills.

Prompts come from the roster: each boss's `portrait:` plus the dungeon-level
`portrait_style:`, joined as "<portrait>. <portrait_style>". Output goes to
dungeons/<dungeon>/portraits/<boss>.jpg. Resumable: an existing portrait is
skipped unless forced. The HTTP call is behind `transport` so tests never
touch the network.
"""
from __future__ import annotations

import base64
import os

from . import gate
from .imagegen import http_transport

MODEL = "bytedance-seed/seedream-4.5"   # flat ~$0.04/img, honours exact size
SIZE = "1728x2304"                      # 3:4 portrait
COST_ESTIMATE = 0.04


class PortraitError(Exception):
    pass


def portrait_path(dungeon, slug, dungeons_root="dungeons"):
    return os.path.join(dungeons_root, dungeon, "portraits", f"{slug}.jpg")


def build_prompt(boss, style):
    return f"{boss['portrait'].strip()}. {style.strip()}"


def plan(dungeon, roster, bosses, *, force=(), dungeons_root="dungeons"):
    """One job per boss: {slug, prompt, out, skip}. Raises PortraitError if
    the roster has no portrait_style or a boss has no portrait."""
    style = roster.get("portrait_style")
    if not style or not style.strip():
        raise PortraitError(f"{dungeon}: roster.yaml has no portrait_style")
    missing = [b["slug"] for b in bosses if not (b.get("portrait") or "").strip()]
    if missing:
        raise PortraitError(f"{dungeon}: no `portrait:` for {', '.join(missing)}")
    jobs = []
    for b in bosses:
        out = portrait_path(dungeon, b["slug"], dungeons_root)
        jobs.append({
            "slug": b["slug"],
            "prompt": build_prompt(b, style),
            "out": out,
            "skip": os.path.exists(out) and b["slug"] not in force,
        })
    return jobs


def render(job, api_key, dungeon, *, transport=http_transport, cost_log_path="cost.log"):
    """Generate one portrait; writes job["out"], logs real spend. Returns cost."""
    body = {"model": MODEL, "prompt": job["prompt"], "size": SIZE}
    try:
        d = transport(body, api_key)
        raw = base64.b64decode(d["data"][0]["b64_json"])
    except Exception as e:  # noqa: BLE001 — surface any API/shape failure per boss
        raise PortraitError(f"{job['slug']}: {e}") from e
    cost = (d.get("usage") or {}).get("cost", 0.0)
    gate.append_cost_log(f"{dungeon}/{job['slug']}-portrait", MODEL, cost, path=cost_log_path)
    os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
    with open(job["out"], "wb") as f:
        f.write(raw)
    return cost
