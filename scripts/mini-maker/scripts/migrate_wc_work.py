#!/usr/bin/env python3.12
"""One-off: move the pre-generalization Wailing Caverns working state
(work/wc-<boss>/) to the dungeon-scoped layout (work/wailing-caverns/<boss>/).

For each work/wc-<boss>/ directory:
  - move the folder to work/wailing-caverns/<boss>/
  - meta.json: slug wc-<boss> -> <boss>; meshy.downloaded.*.path rewritten
    from out/wc-<boss>/... to work/wailing-caverns/<boss>/...
  - hero.yaml: slug -> <boss>; keys the boss schema no longer has dropped
work/wc-contact.jpg moves to work/wailing-caverns/stills-contact.jpg.

Dry-run by default (prints the plan, touches nothing); `--apply` does it.
Refuses to overwrite an existing destination. Run from the repo root:
  PYTHONPATH=.pylib python3.12 scripts/migrate_wc_work.py [--root DIR] [--apply]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

import yaml

DUNGEON = "wailing-caverns"
OLD_PREFIX = "wc-"
# What a normalized boss record (heroes.normalize) carries; anything else in
# an old hero.yaml is a pre-generalization leftover.
KEPT_KEYS = ("slug", "name", "desc", "palette", "views", "finish", "notes",
             "back", "seed", "seed_sent", "portrait")


def migrate_hero_yaml(text, boss):
    record = yaml.safe_load(text)
    record["slug"] = boss
    record = {k: v for k, v in record.items() if k in KEPT_KEYS}
    return yaml.safe_dump(record, sort_keys=False, allow_unicode=True)


def migrate_meta(meta, boss):
    old, new = f"out/{OLD_PREFIX}{boss}/", f"work/{DUNGEON}/{boss}/"
    meta["slug"] = boss
    for entry in ((meta.get("meshy") or {}).get("downloaded") or {}).values():
        if isinstance(entry.get("path"), str) and entry["path"].startswith(old):
            entry["path"] = new + entry["path"][len(old):]
    return meta


def plan(root):
    work = os.path.join(root, "work")
    moves = []
    for name in sorted(os.listdir(work)) if os.path.isdir(work) else []:
        src = os.path.join(work, name)
        if name.startswith(OLD_PREFIX) and os.path.isdir(src):
            boss = name[len(OLD_PREFIX):]
            moves.append((boss, src, os.path.join(work, DUNGEON, boss)))
    contact = os.path.join(work, OLD_PREFIX + "contact.jpg")
    contact_dst = os.path.join(work, DUNGEON, "stills-contact.jpg")
    return moves, (contact, contact_dst) if os.path.exists(contact) else None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="repo checkout holding work/ and dungeons/")
    ap.add_argument("--apply", action="store_true", help="actually move (default: dry run)")
    args = ap.parse_args(argv)

    moves, contact = plan(args.root)
    clashes = [dst for _, _, dst in moves if os.path.exists(dst)]
    if contact and os.path.exists(contact[1]):
        clashes.append(contact[1])
    if clashes:
        print("error: destination(s) already exist, nothing moved:\n  " + "\n  ".join(clashes), file=sys.stderr)
        return 1
    if not moves and not contact:
        print("nothing to migrate")
        return 0

    verb = "MOVE" if args.apply else "WOULD MOVE"
    for boss, src, dst in moves:
        print(f"{verb} {src} -> {dst}  (meta.json + hero.yaml slug -> {boss})")
    if contact:
        print(f"{verb} {contact[0]} -> {contact[1]}")
    if not args.apply:
        print(f"\nDRY RUN — {len(moves)} boss dir(s). Re-run with --apply to do it.")
        return 0

    for boss, src, dst in moves:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(src, dst)
        meta_p = os.path.join(dst, "meta.json")
        if os.path.exists(meta_p):
            with open(meta_p, encoding="utf-8") as f:
                meta = migrate_meta(json.load(f), boss)
            with open(meta_p, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, sort_keys=True)
        hero_p = os.path.join(dst, "hero.yaml")
        if os.path.exists(hero_p):
            with open(hero_p, encoding="utf-8") as f:
                text = migrate_hero_yaml(f.read(), boss)
            with open(hero_p, "w", encoding="utf-8") as f:
                f.write(text)
    if contact:
        shutil.move(*contact)
    print(f"\nmigrated {len(moves)} boss dir(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
