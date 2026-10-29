"""Stage D — compression + textured/untextured dedup.

Dependency: `@gltf-transform/cli` (Node, via `npx`), pinned to 4.5.0 — chosen
over Blender headless because this host has Node but no Blender, and
gltf-transform's `simplify` (meshoptimizer) and `draco` commands cover both
outputs without needing a full DCC install. Named and justified again in the
task's final message.

`simplify` decimates for the print STL (Meshy's raw ~600K faces down to the
20K-50K printable range, MESHY.md); `draco` compresses geometry for the web
glb. Neither step needs a texture path: Stage C always requests
`should_texture: false`, so there is no textured variant to re-encode
(see the Stage D.1 probe finding recorded in meta.json / the task's final
message).

gltf-transform has no STL exporter, so the decimated .glb is converted to
`print.stl` with `glbtools` (stdlib-only).
"""
from __future__ import annotations

import gzip
import os
import subprocess

from . import footprint as footprint_lib
from . import gate, glbtools
from . import normals as normals_lib

GLTF_TRANSFORM = ["npx", "--yes", "@gltf-transform/cli@4.5.0"]
PRINT_TARGET_FACES = 35_000
PRINT_RANGE = (20_000, 50_000)
# Web target: a display mesh needs far more detail than a 32mm print, but
# Meshy's raw output (measured ~1.2M-1.7M faces, denser than MESHY.md's ~600K
# ballpark) is still overkill for on-screen viewing. Simplify to this ceiling
# before Draco so the compressed .glb lands in the "couple MB" target instead
# of scaling with however dense Meshy happened to sculpt this hero.
WEB_SIMPLIFY_CEILING_FACES = 150_000

# Play tier: a light tabletop/game-engine mesh. At play size (~100x135
# device px) 150K/30K/15K triangles all look the same, and a typical web
# tabletop decodes Meshopt (EXT_meshopt_compression + KHR_mesh_quantization)
# rather than Draco, so the Draco `web.glb` can't stand in for it. Two tiers:
# a hero tier for the boss itself, and a lighter crowd tier for minis
# rendered in numbers. Always produced alongside web.glb (not behind a
# flag) — Stage D already always produces print+web unconditionally for a
# mesh_approved slug, and a third small, cheap (no paid calls, pure local
# compute) output follows that precedent.
#
# mini-004 found a smooth-normal artifact (a star of long thin base
# triangles) that a straight simplify+meshopt play tier carries over from
# the raw mesh; mini-005's fix is a whole-mesh crease-split normal recompute
# (see `normals.creased_normals`) after simplify, at this angle threshold —
# The operator picked it (`C2-45-budget`) by eye, live on the tabletop, 2026-09-28.
CREASE_THRESHOLD_DEG = 45
# Crease-splitting duplicates vertices at every hard edge, so it costs bytes
# a straight simplify+meshopt play tier didn't pay. The old rationale here
# was "20-30K faces looks fine on a ~100x135px tabletop token"; the new one
# is 15K pre-crease, byte-matched to the old 25K (stale-normal) file — see
# mini-004's `C2-45-budget` candidate: simplifying to ~15K faces before the
# crease pass reproduces the old play.glb's byte size (measured on
# king-taranis: 14,996 tris/15,119 verts/125,572 B/107,351 B gz, vs the old
# C0 path's 24,996 tris/179,808 B/151,314 B gz at an un-budget-matched 25K).
PLAY_TARGET_FACES = 15_000
# gltf-transform's ratio-based simplify doesn't hit PLAY_TARGET_FACES
# exactly (measured 14,996 on king-taranis at a target of 15,000) — this is
# the expected final-triangle-count neighbourhood around it, informational
# only (not enforced); the byte-budget guard below is the real backstop.
PLAY_RANGE = (14_000, 16_000)
# The real backstop (mini-005): fail loudly instead of silently picking a
# lower pre-crease target if a future hero's crease-split geometry doesn't
# fit — mini-004's search over successively smaller pre-crease targets
# showed the byte cost of crease-splitting is mesh-dependent (how creased
# the geometry actually is), not a fixed multiplier on PLAY_TARGET_FACES.
PLAY_BYTE_BUDGET = 140_000
PLAY_GZIP_BUDGET = 110_000
# The old play-15k.glb name described its own (pre-crease-split) triangle
# count; crease-splitting duplicates vertices at every hard edge, so
# matching the old byte ratio to play.glb (~15K/25K, i.e. ~60%) at the new,
# smaller PLAY_TARGET_FACES means a lower pre-crease target too. The file
# name stays play-15k.glb regardless (a filename is an interface) even
# though ~9K no longer matches "15k".
PLAY_15K_TARGET_FACES = 9_000
# The bottom slice of the mesh used to find the base footprint (center x/z,
# diameter) — see footprint.py. 1% of the mesh's height comfortably covers
# a mini's flat base plate without reaching up into leg geometry (checked
# against king-taranis: the footprint point count and diameter are stable
# across slice_frac 0.01-0.02, meaning by 1% the whole base disc is already
# captured).
FOOTPRINT_SLICE_FRAC = footprint_lib.DEFAULT_SLICE_FRAC

# Bands reported alongside the chosen FOOTPRINT_SLICE_FRAC for base_diameter
# (mini-003) so the slice-thickness choice is visible in meta.json rather
# than an unexamined constant — see footprint.base_axis_extents_bands.
BASE_DIAMETER_BANDS = (0.01, 0.02, 0.05)


class CompressError(Exception):
    pass


# Stage D.1 finding (real, logged probe — see meshy-tests/LOG.md "stage-d1-probe"
# rows and the task's final message for the visual comparison): a
# should_texture: true task and a should_texture: false task from the same
# input still are the same sculpt. king-taranis/front.png, 2026-09-27:
# texture-false task 01a0e325-97a2-7380-8856-46f749b94c36 (20 credits,
# 1,234,040 faces) vs texture-true task 01a0e327-3d3c-717a-aea9-82e7dda67aea
# (30 credits, 1,217,099 faces) — a ~1.4% delta consistent with UV-seam
# vertex splitting, not a different sculpt. Stage C already always requests
# should_texture: false (one task per hero), so there is no textured variant
# for Stage D to re-encode; this is recorded per hero for the record.
TEXTURE_PROBE_FINDING = (
    "same geometry, texture applied after (probe: king-taranis/front.png, "
    "2026-09-27; should_texture=false task 01a0e325-97a2-7380-8856-46f749b94c36 "
    "1,234,040 faces/20 credits vs should_texture=true task "
    "01a0e327-3d3c-717a-aea9-82e7dda67aea 1,217,099 faces/30 credits, ~1.4% "
    "delta consistent with UV-seam splitting; Stage C always requests "
    "should_texture=false, one task per hero)"
)


def _run(args, run_cmd=subprocess.run):
    result = run_cmd(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise CompressError(f"{' '.join(args)} failed: {result.stderr.strip()[-2000:]}")
    return result


def simplify_glb(src, dst, ratio, run_cmd=subprocess.run):
    args = GLTF_TRANSFORM + [
        "simplify", src, dst,
        "--ratio", str(ratio),
        "--error", "1",
        "--vertex-layout", "separate",
    ]
    _run(args, run_cmd)


def draco_compress(src, dst, run_cmd=subprocess.run):
    args = GLTF_TRANSFORM + ["draco", src, dst]
    _run(args, run_cmd)


def meshopt_compress(src, dst, run_cmd=subprocess.run):
    """Meshopt-compress geometry (EXT_meshopt_compression) with quantized
    attributes (KHR_mesh_quantization) — the codec a web tabletop decodes,
    unlike Draco (see the play-tier note above)."""
    args = GLTF_TRANSFORM + ["meshopt", src, dst]
    _run(args, run_cmd)


def dequantize_glb(src, dst, run_cmd=subprocess.run):
    """Decode EXT_meshopt_compression and KHR_mesh_quantization back to
    plain float32 positions, in one gltf-transform pass — used only to
    measure the play tier's true base size on the artifact that actually
    ships (mini-003), never to change what Stage D writes."""
    args = GLTF_TRANSFORM + ["dequantize", src, dst]
    _run(args, run_cmd)


def _simplify_ratio(raw_faces, target_faces):
    return max(min(target_faces / raw_faces, 1.0), 0.001)


def _build_play_tier(raw_glb, raw_faces, target_faces, mesh_dir, tag, dst_path, run_cmd,
                      *, byte_budget=None, gzip_budget=None):
    """Simplify `raw_glb` to ~target_faces, crease-split and recompute its
    normals at `CREASE_THRESHOLD_DEG` (mini-005), translate the base to
    y=0 and centre/scale it on its footprint, then Meshopt-compress with
    quantized attributes. If `byte_budget`/`gzip_budget` are given, raises
    CompressError instead of writing a tier that exceeds them — a guard,
    not the primary sizing mechanism (mini-005: pick PLAY_TARGET_FACES /
    PLAY_15K_TARGET_FACES up front instead of silently searching for
    whatever fits). Returns a meta dict for this tier."""
    ratio = _simplify_ratio(raw_faces, target_faces)
    simplified = os.path.join(mesh_dir, f"_{tag}_simplified.glb")
    simplify_glb(raw_glb, simplified, ratio, run_cmd=run_cmd)

    positions, indices = glbtools.read_triangles(simplified)
    faces_after = len(indices) // 3

    # Crease-split normals before the base-to-zero/footprint transform (a
    # uniform scale + translation, so it changes no face angle — see
    # footprint.py's docstring and mini-004's README) — matches the order
    # mini-004's `C2-45-budget` candidate measured.
    creased_positions, creased_normals, creased_indices = normals_lib.creased_normals(
        positions, indices, CREASE_THRESHOLD_DEG,
    )
    creased = os.path.join(mesh_dir, f"_{tag}_creased.glb")
    glbtools.write_mesh(creased, creased_positions, creased_indices, normals=creased_normals)
    os.remove(simplified)

    transform, source_footprint = footprint_lib.base_to_zero_transform(
        creased_positions, slice_frac=FOOTPRINT_SLICE_FRAC,
    )
    transformed_positions = footprint_lib.apply(transform, creased_positions)
    bounds_min, bounds_max = footprint_lib.bounds(transformed_positions)

    normalized = os.path.join(mesh_dir, f"_{tag}_normalized.glb")
    glbtools.rewrite_positions(creased, normalized, transform)
    os.remove(creased)

    meshopt_compress(normalized, dst_path, run_cmd=run_cmd)
    os.remove(normalized)

    bytes_after = os.path.getsize(dst_path)
    if byte_budget is not None and bytes_after > byte_budget:
        raise CompressError(
            f"{tag}: play tier is {bytes_after} B, over the {byte_budget} B "
            f"budget at target_faces={target_faces} (pre-crease) — lower "
            "the tier's *_TARGET_FACES constant, don't silently pick one "
            "here (mini-005)"
        )
    if gzip_budget is not None:
        with open(dst_path, "rb") as f:
            gzip_bytes_after = len(gzip.compress(f.read(), compresslevel=9))
        if gzip_bytes_after > gzip_budget:
            raise CompressError(
                f"{tag}: play tier gzips to {gzip_bytes_after} B, over the "
                f"{gzip_budget} B budget at target_faces={target_faces} "
                "(pre-crease) — lower the tier's *_TARGET_FACES constant, "
                "don't silently pick one here (mini-005)"
            )

    # Measure the base on the FINAL decoded output — after Meshopt and
    # KHR_mesh_quantization are undone, including the node transform
    # gltf-transform inserts to remap quantized values back to the true
    # bounding box — not on the pre-compression `normalized` mesh, so the
    # recorded number reflects what actually ships (mini-003).
    decoded = os.path.join(mesh_dir, f"_{tag}_decoded_check.glb")
    dequantize_glb(dst_path, decoded, run_cmd=run_cmd)
    decoded_positions, _ = glbtools.read_triangles(decoded)
    node_transform = glbtools.read_node_transform(decoded)
    final_positions = [node_transform(*p) for p in decoded_positions]
    os.remove(decoded)

    bands = footprint_lib.base_axis_extents_bands(final_positions, BASE_DIAMETER_BANDS)
    chosen = bands[f"{FOOTPRINT_SLICE_FRAC:.2f}"]
    base_diameter = {
        "value": chosen["base_diameter"],
        "x_extent": chosen["x_extent"],
        "z_extent": chosen["z_extent"],
        "slice_frac": FOOTPRINT_SLICE_FRAC,
        "bands": bands,
    }

    return {
        "faces_before": raw_faces,
        "faces_after": faces_after,
        "vertices_after": len(creased_positions),
        "bytes_after": bytes_after,
        "technique": (
            "gltf-transform simplify (meshoptimizer, ratio=%.4f) + whole-mesh "
            "crease-split normal recompute (%ddeg, own implementation, "
            "mini-005) + base-to-zero/footprint-normalise transform + "
            "gltf-transform meshopt (EXT_meshopt_compression, "
            "KHR_mesh_quantization)" % (ratio, CREASE_THRESHOLD_DEG)
        ),
        "normals": f"crease-split {CREASE_THRESHOLD_DEG}deg, recomputed after simplify",
        "format": "glb",
        "footprint_source": source_footprint,
        "scale_applied": 1.0 / source_footprint["diameter"],
        "bounds_after": {"min": list(bounds_min), "max": list(bounds_max)},
        "axes": "up=+y, front=+z (checked against front.png/back.png — see README Stage D)",
        "base_diameter": base_diameter,
    }


def compress_hero(slug, *, root="work", run_cmd=subprocess.run,
                   texture_probe_outcome=TEXTURE_PROBE_FINDING):
    """Live Stage D for a mesh_approved slug. Raises gate.GateError if the
    gate isn't open. Returns the updated meta dict.
    """
    meta = gate.load_meta(slug, root)
    gate.require_stage(
        meta, slug, "mesh_status", gate.MESH_APPROVED,
        f"python3.12 scripts/mini.py approve --dungeon {os.path.basename(root)} --only {slug} --stage mesh",
    )

    mesh_dir = os.path.join(gate.out_dir(slug, root), "mesh")
    raw_glb = os.path.join(mesh_dir, "raw.glb")
    raw_stl = os.path.join(mesh_dir, "raw.stl")
    if not os.path.exists(raw_glb):
        raise CompressError(f"{slug}: {raw_glb} missing — Stage C didn't download a glb")

    raw_faces = glbtools.stl_facet_count(raw_stl) if os.path.exists(raw_stl) else glbtools.glb_face_count(raw_glb)
    raw_glb_bytes = os.path.getsize(raw_glb)
    raw_stl_bytes = os.path.getsize(raw_stl) if os.path.exists(raw_stl) else None

    # --- print.stl: decimate to the 20K-50K printable range, then export STL ---
    print_path = os.path.join(mesh_dir, "print.stl")
    if raw_faces <= PRINT_RANGE[1]:
        # Already in (or under) range — Meshy's raw mesh doesn't need decimating.
        decimated_glb = raw_glb
        technique = "none (raw mesh already <= 50K faces)"
    else:
        ratio = max(min(PRINT_TARGET_FACES / raw_faces, 1.0), 0.001)
        decimated_glb = os.path.join(mesh_dir, "_print_decimated.glb")
        simplify_glb(raw_glb, decimated_glb, ratio, run_cmd=run_cmd)
        technique = "gltf-transform simplify (meshoptimizer, ratio=%.4f)" % ratio
    print_faces = glbtools.glb_to_stl(decimated_glb, print_path)
    if decimated_glb != raw_glb and os.path.exists(decimated_glb):
        os.remove(decimated_glb)
    print_bytes_after = os.path.getsize(print_path)

    # --- web.glb: simplify to a display-appropriate density, then Draco-compress ---
    web_path = os.path.join(mesh_dir, "web.glb")
    if raw_faces <= WEB_SIMPLIFY_CEILING_FACES:
        draco_compress(raw_glb, web_path, run_cmd=run_cmd)
        web_technique = "Draco (gltf-transform draco, edgebreaker, default quantization)"
    else:
        web_ratio = max(min(WEB_SIMPLIFY_CEILING_FACES / raw_faces, 1.0), 0.001)
        web_simplified = os.path.join(mesh_dir, "_web_simplified.glb")
        simplify_glb(raw_glb, web_simplified, web_ratio, run_cmd=run_cmd)
        draco_compress(web_simplified, web_path, run_cmd=run_cmd)
        os.remove(web_simplified)
        web_technique = (
            "gltf-transform simplify (meshoptimizer, ratio=%.4f) + Draco "
            "(edgebreaker, default quantization)" % web_ratio
        )
    web_bytes_after = os.path.getsize(web_path)

    # --- play.glb / play-15k.glb: simplify raw.glb (not web.glb) straight to
    # play density, base-to-zero + footprint-normalise, Meshopt-compress ---
    play_path = os.path.join(mesh_dir, "play.glb")
    play_meta = _build_play_tier(
        raw_glb, raw_faces, PLAY_TARGET_FACES, mesh_dir, "play", play_path, run_cmd,
        byte_budget=PLAY_BYTE_BUDGET, gzip_budget=PLAY_GZIP_BUDGET,
    )
    play_15k_path = os.path.join(mesh_dir, "play-15k.glb")
    play_15k_meta = _build_play_tier(
        raw_glb, raw_faces, PLAY_15K_TARGET_FACES, mesh_dir, "play_15k", play_15k_path, run_cmd,
    )

    meta["stage_d"] = {
        "texture_probe_outcome": texture_probe_outcome,
        "print": {
            "faces_before": raw_faces,
            "faces_after": print_faces,
            "bytes_before": raw_stl_bytes,
            "bytes_after": print_bytes_after,
            "technique": technique,
            "format": "stl",
        },
        "web": {
            "bytes_before": raw_glb_bytes,
            "bytes_after": web_bytes_after,
            "technique": web_technique,
            "format": "glb",
        },
        "play": {"bytes_before": raw_glb_bytes, **play_meta},
        "play_15k": {"bytes_before": raw_glb_bytes, **play_15k_meta},
    }
    gate.save_meta(slug, meta, root)
    return meta
