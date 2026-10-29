"""Roster loading and boss-record normalization.

`dungeons/<dungeon>/roster.yaml` is the pipeline's only input. It is a
mapping: dungeon-level fields (`name`, `portrait_style`) plus a `bosses:`
list of boss records. This module turns each raw record into the normalized
shape the rest of the pipeline uses, and rejects anything the pipeline
cannot render before any network call is made.
"""
from __future__ import annotations

import os
import re
import zlib

import yaml

ALLOWED_VIEWS = ("front", "back")
# Named explicitly so the error message can say *why* — a probe hasn't
# cleared them yet (see PLAYBOOK.md "Still open").
NOT_YET_SUPPORTED_VIEWS = ("side", "three-quarter")

REQUIRED_FIELDS = ("slug", "name", "desc", "palette", "views", "finish", "notes")

SLUG_RE = r"[a-z0-9]+(-[a-z0-9]+)*"


class HeroError(ValueError):
    pass


ROSTERS_ROOT = "dungeons"  # config.enter() points this at the checkout's dungeons/


def roster_path(dungeon, root=None):
    return os.path.join(root or ROSTERS_ROOT, dungeon, "roster.yaml")


def check_slug(slug, what="slug"):
    if not re.fullmatch(SLUG_RE, slug or ""):
        raise HeroError(f"{slug!r}: {what} must be lowercase kebab-case")
    return slug


def load_roster(path):
    """Load a dungeon roster. Returns {"name", "portrait_style", "bosses"},
    `bosses` being the normalized records in file order."""
    if not os.path.exists(path):
        raise HeroError(f"{path} does not exist — scaffold it with: python3.12 scripts/mini.py new-dungeon <slug>")
    with open(path, "r", encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    if not isinstance(doc, dict):
        raise HeroError(f"{path}: expected a mapping with a `bosses:` list")
    records = doc.get("bosses") or []
    if not isinstance(records, list):
        raise HeroError(f"{path}: `bosses` must be a list of boss records")
    heroes = [normalize(r) for r in records]
    seen = {}
    for h in heroes:
        seen.setdefault(h["slug"], 0)
        seen[h["slug"]] += 1
    dupes = sorted(s for s, n in seen.items() if n > 1)
    if dupes:
        raise HeroError(f"duplicate boss slug(s) in {path}: {', '.join(dupes)}")
    style = doc.get("portrait_style")
    if style is not None and not isinstance(style, str):
        raise HeroError(f"{path}: portrait_style must be a string")
    return {"name": doc.get("name"), "portrait_style": style, "bosses": heroes}


def load_heroes(path):
    return load_roster(path)["bosses"]


def normalize(record):
    label = record.get("slug") or record.get("name") or "<unknown hero>"
    missing = [k for k in REQUIRED_FIELDS if k not in record]
    if missing:
        raise HeroError(f"{label}: missing field(s): {', '.join(missing)}")

    slug = check_slug(str(record["slug"]).strip())

    finish = record["finish"]
    if finish not in ("painted", "grey"):
        raise HeroError(f"{slug}: unknown finish {finish!r} (expected painted|grey)")

    raw_views = list(record["views"])
    for v in raw_views:
        if v in NOT_YET_SUPPORTED_VIEWS:
            raise HeroError(f"{slug}: view {v!r} not supported yet")
        if v not in ALLOWED_VIEWS:
            raise HeroError(f"{slug}: unknown view {v!r}")
    views = ["front"] + [v for v in raw_views if v != "front"]

    back_sentence = record.get("back")
    if "back" in views and not back_sentence:
        raise HeroError(
            f"{slug}: views include 'back' but no 'back' hidden/visible sentence is set "
            "(see PLAYBOOK.md 'Back-view rule')"
        )

    palette = list(record["palette"])
    # seed is recorded for reproducibility but not sent to the image API —
    # PLAYBOOK.md "Still open": untested whether Gemini honours it.
    seed = zlib.crc32(slug.encode("utf-8")) & 0xFFFFFFFF

    portrait = record.get("portrait")
    if portrait is not None and not isinstance(portrait, str):
        raise HeroError(f"{slug}: portrait must be a string")

    return {
        "slug": slug,
        "name": record["name"],
        "desc": record["desc"],
        "palette": palette,
        "views": views,
        "finish": finish,
        "notes": record["notes"],
        "back": back_sentence,
        "seed": seed,
        "seed_sent": False,
        "portrait": portrait,
    }


def select(heroes, only):
    """Filter a normalized hero list by --only, preserving file order.

    `only` is None (keep all) or an iterable of slugs. Raises HeroError
    naming any slug that isn't in the roster.
    """
    if only is None:
        return list(heroes)
    only = list(only)
    by_slug = {h["slug"]: h for h in heroes}
    unknown = [s for s in only if s not in by_slug]
    if unknown:
        raise HeroError(f"unknown slug(s) in --only: {', '.join(unknown)}")
    return [by_slug[s] for s in only]
