"""Stage A — stills. Front first, then every other view anchored to it."""
from __future__ import annotations

import os
import time

from . import gate, prompts
from .imagegen import RenderError, make_anchor_jpeg, render_still

DEFAULT_MODEL = "google/gemini-3.1-flash-image"
DEFAULT_SIZE = "2048x2048"


def plan(hero):
    """The dry-run / live plan: one entry per view, in render order."""
    entries = []
    for view in hero["views"]:
        entries.append(
            {
                "slug": hero["slug"],
                "view": view,
                "prompt": prompts.build_prompt(hero, view),
                "anchored": view != "front",
            }
        )
    return entries


def render_hero(hero, api_key, *, model=DEFAULT_MODEL, size=DEFAULT_SIZE,
                 root="work", cost_log_path="cost.log", render_fn=render_still):
    """Live Stage A for one hero. Raises RenderError naming the failed view;
    views already written stay on disk. On success, writes meta.json with
    stills_status stills_pending and returns the meta dict.
    """
    slug = hero["slug"]
    out_dir = gate.fresh_slug_dir(slug, root)

    stills = {}
    prompt_lines = []
    front_path = None
    for view in hero["views"]:
        prompt = prompts.build_prompt(hero, view)
        prompt_lines.append(f"=== {view} ===\n{prompt}\n")

        anchor_bytes = None
        if view != "front":
            anchor_bytes = make_anchor_jpeg(front_path)

        tag = f"{slug}-{hero['finish']}-{view}"
        png_bytes, cost = render_fn(model, prompt, size, api_key, view, anchor_bytes=anchor_bytes)

        view_path = os.path.join(out_dir, f"{view}.png")
        with open(view_path, "wb") as f:
            f.write(png_bytes)
        if view == "front":
            front_path = view_path

        gate.append_cost_log(tag, model, cost, path=cost_log_path)
        stills[view] = {
            "cost": cost,
            "bytes": len(png_bytes),
            "anchored": view != "front",
        }

    with open(os.path.join(out_dir, "prompt.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(prompt_lines))

    hero_record = {k: v for k, v in hero.items()}
    with open(os.path.join(out_dir, "hero.yaml"), "w", encoding="utf-8") as f:
        import yaml
        yaml.safe_dump(hero_record, f, sort_keys=False, allow_unicode=True)

    meta = {
        "slug": slug,
        "name": hero["name"],
        "views": hero["views"],
        "finish": hero["finish"],
        "model": model,
        "size": size,
        "seed": hero["seed"],
        "seed_sent": False,
        "stills": stills,
        "stills_status": gate.STILLS_PENDING,
        "stills_approved_by": None,
        "stills_approved_at": None,
        "mesh_status": None,
        "mesh_approved_by": None,
        "mesh_approved_at": None,
        "created_at": time.time(),
    }
    gate.save_meta(slug, meta, root)
    return meta
