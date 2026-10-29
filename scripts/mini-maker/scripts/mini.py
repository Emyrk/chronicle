#!/usr/bin/env python3.12
"""mini-maker CLI — a dungeon's boss roster -> reviewed, compressed,
published Meshy minis.

Stages: A (stills) -> B (still-review gate) -> C (Meshy submission + mesh
gate) -> D (compress) -> publish. Every command takes `--dungeon <slug>`:
the roster is dungeons/<slug>/roster.yaml, working state is
work/<slug>/<boss>/, published minis land in dungeons/<slug>/<boss>/. See
README.md for the full pipeline and output contract, MESHY.md for the
Meshy settings, PLAYBOOK.md for the prompt blocks.

Run with `python3.12 scripts/mini.py <command> ...` from scripts/mini-maker/ — see
README.md "Run". State lives under the configured workdir (mini_lib/config.py).
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mini_lib import config, gate, import_mesh as import_mesh_lib, meshy, portraits, publish, scaffold, stage_a, stage_c, stage_d
from mini_lib.heroes import HeroError, check_slug, load_roster, roster_path, select
from mini_lib.imagegen import RenderError


def _require_env(name):
    value = os.environ.get(name)
    if not value:
        raise SystemExit(
            f"error: {name} is not set. Export it, or set `env_file` in local.yaml (see local.example.yaml)"
        )
    return value


def _only_list(only):
    if only is None:
        return None
    return [s.strip() for s in only.split(",") if s.strip()]


def _cmd(name, dungeon, rest=""):
    return f"python3.12 scripts/mini.py {name} --dungeon {dungeon} {rest}".rstrip()


def _root(args):
    return gate.work_root(args.dungeon)


def _load(args):
    """(roster, selected bosses) for --dungeon/--only, or None after
    printing the error."""
    try:
        check_slug(args.dungeon, "--dungeon")
        roster = load_roster(roster_path(args.dungeon))
        bosses = select(roster["bosses"], _only_list(getattr(args, "only", None)))
    except HeroError as e:
        print(f"error: {e}", file=sys.stderr)
        return None
    if not bosses:
        print("error: no bosses selected", file=sys.stderr)
        return None
    return roster, bosses


def _check_slugs(args):
    """Validate --dungeon and every --only slug against the roster."""
    loaded = _load(args)
    return None if loaded is None else [b["slug"] for b in loaded[1]]


def cmd_render(args):
    loaded = _load(args)
    if loaded is None:
        return 1
    _, roster = loaded

    if args.dry_run:
        return _dry_run(args.dungeon, roster)

    if args.auto:
        return _run_auto(roster, args)

    api_key = _require_env("OPENROUTER_API_KEY")
    for hero in roster:
        rc = _render_one(hero, api_key, args)
        if rc != 0:
            return rc
    return 0


def _dry_run(dungeon, roster):
    print(f"DRY RUN — {dungeon}: {len(roster)} boss(es), no files written, no network calls\n")
    for hero in roster:
        print(f"=== {hero['slug']} ({hero['finish']}, views: {', '.join(hero['views'])}) ===")
        print(f"working dir: {gate.out_dir(hero['slug'], gate.work_root(dungeon))}/")
        print(f"seed: {hero['seed']} (recorded only — not sent to the API)")
        for entry in stage_a.plan(hero):
            anchor_note = " [anchored to front.png, downscaled 1024px JPEG]" if entry["anchored"] else ""
            print(f"\n--- {entry['view']}{anchor_note} ---")
            print(entry["prompt"])
        print()
    return 0


def _render_one(hero, api_key, args):
    slug = hero["slug"]
    work_dir = gate.out_dir(slug, _root(args))
    try:
        stage_a.render_hero(hero, api_key, model=args.model, size=args.size, root=_root(args))
    except RenderError as e:
        print(f"error: {slug}: view failed: {e}", file=sys.stderr)
        print(f"        views already written stay on disk under {work_dir}/", file=sys.stderr)
        return 1
    print(f"OK  {slug}: stills packaged, status=stills_pending")
    print(f"    review {work_dir}/*.png, then:")
    print(f"    {_cmd('approve', args.dungeon, f'--only {slug} --stage stills')}")
    return 0


def cmd_approve(args):
    if _check_slugs(args) is None:
        return 1
    slug = args.only
    root = _root(args)
    meta = gate.load_meta(slug, root)
    if meta is None:
        print(f"error: no {gate.meta_path(slug, root)} — run render first", file=sys.stderr)
        return 1

    if args.stage == "stills":
        if meta.get("stills_status") not in (gate.STILLS_PENDING,):
            print(
                f"error: {slug} stills_status is {meta.get('stills_status')!r}, not stills_pending",
                file=sys.stderr,
            )
            return 1
        gate.set_gate(meta, "stills_status", gate.STILLS_APPROVED, gate.STILLS_REJECTED,
                       reject=args.reject, gate_by="manual")
    else:
        if meta.get("mesh_status") not in (gate.MESH_PENDING,):
            print(
                f"error: {slug} mesh_status is {meta.get('mesh_status')!r}, not mesh_pending",
                file=sys.stderr,
            )
            return 1
        gate.set_gate(meta, "mesh_status", gate.MESH_APPROVED, gate.MESH_REJECTED,
                       reject=args.reject, gate_by="manual")

    gate.save_meta(slug, meta, root)
    outcome = "rejected" if args.reject else "approved"
    print(f"OK  {slug}: {args.stage} {outcome}")
    return 0


def cmd_mesh(args):
    slugs = _check_slugs(args)
    if slugs is None:
        return 1
    root = _root(args)
    api_key = None if args.dry_run else _require_env("MESHY_API_KEY")
    rc = 0
    for slug in slugs:
        meta = gate.load_meta(slug, root)
        try:
            gate.require_stage(
                meta, slug, "stills_status", gate.STILLS_APPROVED,
                _cmd("approve", args.dungeon, f"--only {slug} --stage stills"),
            )
        except gate.GateError as e:
            print(f"error: {e}", file=sys.stderr)
            rc = 1
            continue

        if args.dry_run:
            views = meta["views"]
            path = meshy.endpoint_for(views)
            print(f"DRY RUN — {slug}: would POST {path} with images {views}, settings:")
            for k, v in meshy.PRODUCTION_SETTINGS.items():
                print(f"    {k}: {v!r}")
            continue

        try:
            stage_c.submit_hero(slug, api_key, root=root)
        except meshy.MeshyTaskError as e:
            print(f"error: {e}", file=sys.stderr)
            rc = 1
            continue
        print(f"OK  {slug}: mesh downloaded to {gate.out_dir(slug, root)}/mesh/, status=mesh_pending")
        print(stage_c.PASS_CRITERIA)
        print(f"then: {_cmd('approve', args.dungeon, f'--only {slug} --stage mesh')}")
    return rc


def cmd_compress(args):
    slugs = _check_slugs(args)
    if slugs is None:
        return 1
    root = _root(args)
    rc = 0
    for slug in slugs:
        try:
            stage_d.compress_hero(slug, root=root)
        except (gate.GateError, stage_d.CompressError) as e:
            print(f"error: {e}", file=sys.stderr)
            rc = 1
            continue
        print(f"OK  {slug}: {gate.out_dir(slug, root)}/mesh/ print.stl, web.glb, play.glb written")
        print(f"then: {_cmd('publish', args.dungeon, f'--only {slug}')}")
    return rc


def cmd_publish(args):
    slugs = _check_slugs(args)
    if slugs is None:
        return 1
    rc = 0
    published = 0
    for slug in slugs:
        try:
            dest = publish.publish_boss(args.dungeon, slug)
        except publish.PublishError as e:
            print(f"error: {e}", file=sys.stderr)
            rc = 1
            continue
        published += 1
        print(f"OK  {slug}: published to {dest}/")
    if published:
        sheet = publish.refresh_contact_sheet(args.dungeon)
        if sheet:
            print(f"OK  contact sheet refreshed: {sheet}")
    return rc


def cmd_import_mesh(args):
    if _check_slugs(args) is None:
        return 1
    slug = args.only
    root = _root(args)
    try:
        meta = import_mesh_lib.import_mesh(slug, args.glb, root=root, stills_from=args.stills_from)
    except import_mesh_lib.ImportError_ as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"OK  {slug}: {gate.out_dir(slug, root)}/mesh/raw.glb registered, status={meta['mesh_status']}")
    print(f"then: {_cmd('approve', args.dungeon, f'--only {slug} --stage mesh')}")
    return 0


def cmd_portraits(args):
    loaded = _load(args)
    if loaded is None:
        return 1
    roster, bosses = loaded
    force = set(_only_list(args.force) or [])
    unknown = sorted(force - {b["slug"] for b in roster["bosses"]})
    if unknown:
        print(f"error: unknown slug(s) in --force: {', '.join(unknown)}", file=sys.stderr)
        return 1
    try:
        jobs = portraits.plan(args.dungeon, roster, bosses, force=force)
    except portraits.PortraitError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    todo = [j for j in jobs if not j["skip"]]

    if args.dry_run:
        print(f"DRY RUN — {args.dungeon}: {len(todo)} portrait(s) to render "
              f"(~${portraits.COST_ESTIMATE * len(todo):.2f}, {portraits.MODEL} {portraits.SIZE}), "
              f"{len(jobs) - len(todo)} already exist; no files written, no network calls\n")
        for j in jobs:
            print(f"=== {j['slug']} -> {j['out']}{' [SKIP, exists]' if j['skip'] else ''} ===")
            print(j["prompt"])
            print()
        return 0

    for j in jobs:
        if j["skip"]:
            print(f"SKIP {j['slug']} ({j['out']} exists; --force {j['slug']} to reroll)")
    if not todo:
        return 0
    api_key = _require_env("OPENROUTER_API_KEY")
    rc = 0
    total = 0.0
    for j in todo:
        try:
            cost = portraits.render(j, api_key, args.dungeon)
        except portraits.PortraitError as e:
            print(f"error: {e}", file=sys.stderr)
            rc = 1
            continue
        total += cost or 0.0
        print(f"OK  {j['slug']}: {j['out']}  ${cost:.4f}")
    print(f"spend this run: ${total:.4f} (logged to cost.log)")
    return rc


def cmd_new_dungeon(args):
    try:
        path = scaffold.new_dungeon(args.slug)
    except (HeroError, scaffold.ScaffoldError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"OK  wrote {path} — add bosses, then: {_cmd('render', args.slug, '--dry-run')}")
    return 0


def _run_auto(roster, args):
    if not gate.any_manual_mesh_approved():
        print(
            "error: --auto refuses to run — no boss in any dungeon has reached mesh_approved "
            "by a manual `approve --stage mesh` yet. Run one boss through render -> approve "
            "stills -> mesh -> approve mesh by hand first.",
            file=sys.stderr,
        )
        return 1

    openrouter_key = _require_env("OPENROUTER_API_KEY")
    meshy_key = _require_env("MESHY_API_KEY")
    root = _root(args)

    for hero in roster:
        slug = hero["slug"]
        meta = gate.load_meta(slug, root)

        if meta and meta.get("mesh_status") == gate.MESH_APPROVED:
            if "stage_d" not in meta:
                try:
                    stage_d.compress_hero(slug, root=root)
                except stage_d.CompressError as e:
                    print(f"error: {e}", file=sys.stderr)
                    return 1
                print(f"OK  {slug}: already mesh_approved, compressed now")
            else:
                print(f"OK  {slug}: already fully processed, skipping")
            continue

        if meta and meta.get("stills_status") == gate.STILLS_REJECTED:
            print(f"error: {slug} stills were rejected — --auto will not override a rejection", file=sys.stderr)
            return 1
        if meta and meta.get("mesh_status") == gate.MESH_REJECTED:
            print(f"error: {slug} mesh was rejected — --auto will not override a rejection", file=sys.stderr)
            return 1

        if meta is None or meta.get("stills_status") is None:
            try:
                stage_a.render_hero(hero, openrouter_key, model=args.model, size=args.size, root=root)
            except RenderError as e:
                print(f"error: {slug}: view failed: {e}", file=sys.stderr)
                return 1
            meta = gate.load_meta(slug, root)
            print(f"OK  {slug}: stills packaged (auto)")

        if meta.get("stills_status") == gate.STILLS_PENDING:
            gate.set_gate(meta, "stills_status", gate.STILLS_APPROVED, gate.STILLS_REJECTED,
                           reject=False, gate_by="auto")
            gate.save_meta(slug, meta, root)
            print(f"OK  {slug}: stills auto-approved (--auto)")

        try:
            stage_c.submit_hero(slug, meshy_key, root=root)
        except meshy.MeshyTaskError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        print(f"OK  {slug}: mesh downloaded (auto)")

        meta = gate.load_meta(slug, root)
        gate.set_gate(meta, "mesh_status", gate.MESH_APPROVED, gate.MESH_REJECTED,
                       reject=False, gate_by="auto")
        gate.save_meta(slug, meta, root)
        print(f"OK  {slug}: mesh auto-approved (--auto)")

        try:
            stage_d.compress_hero(slug, root=root)
        except stage_d.CompressError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        print(f"OK  {slug}: compressed (auto)")

    return 0


def build_parser():
    p = argparse.ArgumentParser(prog="mini.py")
    sub = p.add_subparsers(dest="command", required=True)

    def dungeon(sp):
        sp.add_argument("--dungeon", required=True,
                        help="dungeon slug: roster dungeons/<slug>/roster.yaml, state work/<slug>/")

    r = sub.add_parser("render", help="Stage A — render stills, or Stage A-D unattended with --auto")
    dungeon(r)
    r.add_argument("--only", default=None, help="comma-separated boss slugs")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--auto", action="store_true")
    r.add_argument("--model", default=stage_a.DEFAULT_MODEL)
    r.add_argument("--size", default=stage_a.DEFAULT_SIZE)
    r.set_defaults(func=cmd_render)

    a = sub.add_parser("approve", help="flip a review gate")
    dungeon(a)
    a.add_argument("--only", required=True, help="single boss slug")
    a.add_argument("--stage", required=True, choices=["stills", "mesh"])
    a.add_argument("--reject", action="store_true")
    a.set_defaults(func=cmd_approve)

    m = sub.add_parser("mesh", help="Stage C — submit a stills_approved boss to Meshy")
    dungeon(m)
    m.add_argument("--only", required=True, help="comma-separated boss slugs")
    m.add_argument("--dry-run", action="store_true")
    m.set_defaults(func=cmd_mesh)

    c = sub.add_parser("compress", help="Stage D — decimate + compress a mesh_approved boss")
    dungeon(c)
    c.add_argument("--only", required=True, help="comma-separated boss slugs")
    c.set_defaults(func=cmd_compress)

    pb = sub.add_parser("publish", help="copy a compressed boss into dungeons/<dungeon>/<boss>/ + refresh the contact sheet")
    dungeon(pb)
    pb.add_argument("--only", required=True, help="comma-separated boss slugs")
    pb.set_defaults(func=cmd_publish)

    i = sub.add_parser("import-mesh", help="register a raw mesh from Meshy's web UI (opens mesh_pending)")
    dungeon(i)
    i.add_argument("--only", required=True, help="single boss slug")
    i.add_argument("--glb", required=True, help="path to the downloaded .glb")
    i.add_argument("--stills-from", default=None, help="sibling working dir to copy hero.yaml/stills/prompt from")
    i.set_defaults(func=cmd_import_mesh)

    pt = sub.add_parser("portraits", help="painted boss portraits from the roster's portrait/portrait_style")
    dungeon(pt)
    pt.add_argument("--only", default=None, help="comma-separated boss slugs")
    pt.add_argument("--force", default=None, help="comma-separated slugs to reroll even if the jpg exists")
    pt.add_argument("--dry-run", action="store_true")
    pt.set_defaults(func=cmd_portraits)

    n = sub.add_parser("new-dungeon", help="scaffold dungeons/<slug>/roster.yaml from the commented template")
    n.add_argument("slug")
    n.set_defaults(func=cmd_new_dungeon)

    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    config.enter()
    raise SystemExit(main())
