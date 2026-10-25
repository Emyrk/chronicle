"""Export a map OBJ (WMO from tools/wmo2obj.py, or terrain from tools/adt2obj.py with --kind terrain) as a
usable 3D model (GLB) plus elevation assets. Called by render_set.py --glb; by hand (Blender 4.3, headless):
  Blender -b -P tools/export_glb.py -- --obj <obj> --outdir <version dir> --slug <slug> [--rot 90]
      [--image-format AUTO|JPEG|WEBP] [--skip-full] [--kind terrain + frame flags] [cull knobs, see --help]

Writes into --outdir:
  <slug>-open-top.glb    the cutaway: ceilings, vault fragments, upper walls and hanging decals
                         removed by the SUPPORT CULL below; props kept; water trimmed.
  <slug>-full.glb        every face (ceilings included) unless --skip-full.
  height.png             16-bit grey top-down elevation of the open-top mesh (no water), same
                         camera as blender_topdown.py: grey 0 = z_min, 65535 = z_max, linear (height.json;
                         versions before 2026-10-18 are sRGB-encoded, see LEARNINGS).
  height.json            z range, WoW bounds, the offset applied to the GLBs, cull stats + args.
  perspective-*.png      3/4 views rendered from the RE-IMPORTED GLBs (proves they round-trip;
                         back faces transparent so it shows what a culling viewer shows).
GLB conventions: glTF Y-up; centred (bbox XY centre -> 0, z_min -> 0; offset in height.json, so
the GLB does NOT share the raw WoW frame of the PNG passes); Principled materials, base colour =
texture, roughness 1, no specular; alpha-keyed WMO materials (blend > 0) export as alphaMode MASK
(cutoff 0.5) via a Math>GreaterThan node, which is how the 4.2+ exporter is told "clip"; back-face
culling on (doubleSided false); water = translucent blue (BLEND, double-sided); all cave groups
joined into one mesh. Vertex colours (WoW baked light) are NOT exported: three.js auto-multiplies
COLOR_0 into the texture and darkens everything.

SUPPORT CULL (the open-top rule; every step numeric, no eyeballing — see README "3D export"):
  1. weld coincident vertices so walls share edges with floors;
  2. FLOOR = upward faces (nz > 0.5) in edge-connected patches of area >= --seed-min-area;
     faces whose texture path contains a --seed-exclude substring are never FLOOR (sloped lava
     streams: Molten Core's lavafloortrans runs 140 yd down Ragnaros' walls); they are judged as walls;
  3. islands of the welded mesh: one with a FLOOR face is cave body; one without is a PROP if its
     lowest vertex rests on floor (--rest-tol) and it is <= --prop-max-height tall (stalagmites,
     rocks: kept whole); any other island is judged face by face like the body;
  4. per face: downward faces (nz < --ceiling-thresh) keep iff FLOOR surface within
     --undercut-cap of the centroid (a lip, not a ceiling); other non-FLOOR faces keep iff FLOOR
     surface within --wall-cap of the centroid (BVH nearest point: no blind spot for mound sides,
     pit rims, walls beside a ledge — rays had one); a small upward patch with no floor within
     --island-depth below is a floor island and is kept;
  5. water tiles keep iff floor within --water-support below.
Known remainder (Wailing Caverns): rim bands whose top surface is a 200-400 sq yd patch stacked
over a pool floor pass as FLOOR, as do the vines hanging from them — same local shape as a bridge.

TERRAIN maps (--kind terrain; render_set passes it for an ADT fetch, with the same frame/smooth flags
as blender_topdown.py). Same files, same height.json keys, same frame and centring rule; the cull fits
the kind instead (open sky: there is no ceiling over the ground to remove):
  1. FRAME = the terrain_ objects' x/y extent (the crop, snapped to chunks), exactly the top-down
     camera's; z from everything. Placed WMOs / liquids reaching past it are CLIPPED to it (bisected,
     not dropped), so the GLB's POSITION extent == bounds_wow == the crop.
  2. BURIED CULL (--keep-buried to skip): a non-terrain face goes iff every vertex is buried:
     terrain more than --bury-depth straight above it, or, under a terrain HOLE (a WMO that replaces
     the ground, like Lordaeron's palace), more than --hole-depth below the ground height filled
     across the hole from its rim AND covered by solid geometry (a pool bottom under water is not);
     or its centroid is more than --straddle-depth below the ground
     (one tall face from the Undercity up past the surface). Lordaeron: drops the Undercity under
     the ruins and the palace.
  3. Placed WMOs are kept WHOLE by default, roofs included. --roof-cull opens the buildings that
     have interiors (MOGP flag 0x2000, read from raw/wmo/<fid>/groups): FLOOR = upward faces of the
     placement's interior groups; a face of ANY group of that placement (domes and tower caps are
     exterior shells) with |nz| > 0.25 goes iff a FLOOR lies --roof-min-drop..--roof-max-drop
     straight below it: a roof, ceiling or upper storey over a room. Walls stay.
  4. Terrain is welded and smooth-shaded (same rule as --smooth-prefix in blender_topdown.py); its
     baked splat atlases are downscaled to --terrain-px-per-yard and cropped to the UVs in use
     (an 8192 px atlas per tile would dominate the file).
  5. The OBJ is in true world coordinates (adt2obj.py), the WMO OBJs are in the pipeline frame that
     negates both horizontal axes; the terrain GLB is turned 180 deg about z so both kinds export as
     glTF (x, y, z) = (-wow_x, wow_z, wow_y) and bounds_wow means the same thing for both.
  height.png is rendered in the UNTURNED world frame with the passes' camera (frame x/y, --rot), so
  it overlays dry.png / textured.png of the same version pixel for pixel (at the same width).
"""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--obj", required=True)
    p.add_argument("--outdir", required=True)
    p.add_argument("--slug", default="map")
    p.add_argument("--rot", type=float, default=90.0)
    p.add_argument("--ceiling-thresh", type=float, default=-0.15)
    p.add_argument("--height-width", type=int, default=2400)
    p.add_argument("--persp-width", type=int, default=1600)
    p.add_argument("--image-format", default="AUTO", choices=["AUTO", "JPEG", "WEBP"])
    p.add_argument("--skip-full", action="store_true", help="only the open-top GLB")
    p.add_argument("--weld", type=float, default=0.01, help="merge vertices closer than this (so walls share edges with floors)")
    p.add_argument("--seed-min-area", type=float, default=10.0,
                   help="an upward-facing patch (nz > 0.5, edge-connected) counts as FLOOR only if its area >= this")
    p.add_argument("--wall-cap", type=float, default=8.0,
                   help="keep a non-floor face only if FLOOR surface is within this many units of its centroid")
    p.add_argument("--undercut-cap", type=float, default=3.0, help="a downward face survives only if floor is within this straight below (a lip, not a ceiling)")
    p.add_argument("--rest-tol", type=float, default=1.0, help="an island with no floor face is a prop if its lowest vertex is within this of floor below")
    p.add_argument("--prop-max-height", type=float, default=12.0, help="... and it is no taller than this; otherwise it is debris")
    p.add_argument("--seed-exclude", default="",
                   help="comma-separated texture-path substrings whose faces never count as FLOOR (judged as walls)")
    p.add_argument("--island-depth", type=float, default=40.0,
                   help="a small upward patch with no floor within this far below it is a floor island and is kept")
    p.add_argument("--water-support", type=float, default=40.0,
                   help="drop a water tile with no floor within this far below it (0 = keep all water)")
    p.add_argument("--kind", default="wmo", choices=["wmo", "terrain"], help="fetch kind (render_set passes it)")
    # terrain only (same meaning as in blender_topdown.py; render_set passes the same values to both)
    p.add_argument("--frame-include-prefix", default=None, help="terrain: only these objects set the x/y frame")
    p.add_argument("--frame-exclude-prefix", default=None, help="terrain: these objects never set the frame")
    p.add_argument("--smooth-prefix", default=None, help="terrain: weld + smooth-shade objects with this prefix")
    p.add_argument("--keep-buried", action="store_true", help="terrain: skip the buried cull")
    p.add_argument("--bury-depth", type=float, default=0.5,
                   help="terrain: a vertex is buried if terrain is more than this far straight above it")
    p.add_argument("--hole-depth", type=float, default=3.0,
                   help="terrain: under a terrain hole, a vertex is buried if this far below the hole-filled ground")
    p.add_argument("--straddle-depth", type=float, default=10.0,
                   help="terrain: a face whose centroid is this far below the ground goes even if a vertex is above it")
    p.add_argument("--roof-cull", action="store_true", help="terrain: open interior WMO groups (see docstring)")
    p.add_argument("--roof-min-drop", type=float, default=2.0, help="terrain --roof-cull: floor at least this far below")
    p.add_argument("--roof-max-drop", type=float, default=25.0, help="terrain --roof-cull: ... and at most this far")
    p.add_argument("--terrain-px-per-yard", type=float, default=6.0,
                   help="terrain: cap the baked ground atlases at this many px per yard in the GLB (0 = keep)")
    return p.parse_args(argv)


def log(*a):
    print(*a, file=sys.stderr)


def import_obj(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=path, forward_axis="Y", up_axis="Z")
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    log(f"imported {len(objs)} objects, {sum(len(o.data.polygons) for o in objs)} faces")
    return objs


def is_liquid(ob):
    return ob.name.startswith("liquid")


def join_solid(objs):
    """Join every non-liquid object into ONE mesh so welding/connectivity cross WMO group seams."""
    solid = [o for o in objs if not is_liquid(o)]
    with bpy.context.temp_override(active_object=solid[0], selected_editable_objects=solid, selected_objects=solid):
        bpy.ops.object.join()
    solid[0].name = "cave"
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def support_cull(objs, weld, seed_min_area, wall_cap, water_support, island_depth=40.0,
                 ceiling_thresh=-0.15, undercut_cap=3.0, rest_tol=1.0, prop_max_height=12.0, seed_exclude=()):
    """Deterministic 'is there floor near this?' cull on the FULL joined mesh (ceilings included).
    1. weld coincident vertices so walls share edges with floors;
    2. FLOOR = upward faces (nz > 0.5) in edge-connected patches of area >= seed_min_area;
    3. islands of the welded mesh: one with a FLOOR face is cave body; one without is a PROP if
       its lowest vertex rests on floor (within rest_tol below) and it is <= prop_max_height tall
       (stalagmites, rocks: kept whole), else it is debris (dropped whole);
    4. other faces (cave body, and islands that neither hold floor nor rest on it): downward
       faces (nz < ceiling_thresh) keep iff FLOOR surface within undercut_cap of the centroid (a
       lip, not a ceiling); other non-FLOOR faces keep iff FLOOR surface within wall_cap of the
       centroid (BVH nearest point: no blind spot for mound sides, pit rims, walls beside a
       ledge); a small upward patch with no floor within island_depth below is a floor island
       and is kept.
    5. water tiles: keep iff floor within water_support below."""
    from mathutils.bvhtree import BVHTree
    cave = next(o for o in objs if not is_liquid(o))
    bm = bmesh.new()
    bm.from_mesh(cave.data)
    if weld > 0:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
    bm.faces.ensure_lookup_table()
    mw = cave.matrix_world
    stats = {"faces_in": len(bm.faces)}
    W = {f.index: [mw @ v.co for v in f.verts] for f in bm.faces}
    NZ = {}
    for i, vs in W.items():
        n = (vs[1] - vs[0]).cross(vs[2] - vs[0])
        NZ[i] = (n.normalized().z if n.length > 0 else 0.0, n.length / 2, Vector((n.x, n.y, 0)))

    def components(face_ids):
        parent = {i: i for i in face_ids}
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for i in face_ids:
            for e in bm.faces[i].edges:
                for g in e.link_faces:
                    if g.index in parent and g.index != i:
                        parent[find(i)] = find(g.index)
        return {i: find(i) for i in face_ids}

    up = {i for i in W if NZ[i][0] > 0.5}
    if seed_exclude:
        def excluded(mat):
            img = image_of(mat) if mat else None
            name = (img.filepath or img.name).lower().replace("\\", "/") if img else ""
            return any(t in name for t in seed_exclude)
        bad = {k for k, sl in enumerate(cave.material_slots) if excluded(sl.material)}
        ex = {i for i in up if bm.faces[i].material_index in bad}
        up -= ex
        stats["seed_excluded_faces"] = len(ex)
    root = components(list(up))
    area = {}
    for i in up:
        area[root[i]] = area.get(root[i], 0.0) + NZ[i][1]
    seeds = {i for i in up if area[root[i]] >= seed_min_area}
    stats.update({"seed_faces": len(seeds), "seed_patches": sum(1 for v in area.values() if v >= seed_min_area)})
    fv, fp = [], []
    for i in sorted(seeds):
        fv.extend(tuple(v) for v in W[i])
        fp.append(tuple(range(len(fv) - len(W[i]), len(fv))))
    bvh = BVHTree.FromPolygons(fv, fp, all_triangles=False, epsilon=0.0)
    down = Vector((0, 0, -1))
    floor_below = lambda o, d: bvh.ray_cast(o, down, d)[0] is not None

    root = components(list(W))
    isl = {}
    for i, r in root.items():
        d = isl.setdefault(r, {"seed": False, "lo": math.inf, "hi": -math.inf, "lowv": None})
        d["seed"] |= i in seeds
        for v in W[i]:
            if v.z < d["lo"]:
                d["lo"], d["lowv"] = v.z, v
            d["hi"] = max(d["hi"], v.z)
    body, props, loose = set(), set(), set()
    for r, d in isl.items():
        if d["seed"]:
            body.add(r)
        elif floor_below(d["lowv"] + Vector((0, 0, 0.05)), rest_tol + 0.05) and d["hi"] - d["lo"] <= prop_max_height:
            props.add(r)
        else:
            loose.add(r)  # no floor face, not resting on floor: judged face by face like the body
    stats.update({"islands": len(isl), "body_islands": len(body), "prop_islands": len(props), "loose_islands": len(loose)})
    near_floor = lambda p, d: bvh.find_nearest(p, d)[0] is not None

    doomed = []
    n_ceil = n_lip = n_wall_cut = n_island = n_loose_kept = 0
    for i, vs in W.items():
        r = root[i]
        if r in props or i in seeds:
            continue
        nz, _, _ = NZ[i]
        c = sum(vs, Vector()) / len(vs)
        # nearest FLOOR surface point within a radius: no blind spot for mound sides, pit rims,
        # or walls standing beside (not above) their floor
        if nz < ceiling_thresh:
            if near_floor(c, undercut_cap):
                n_lip += 1
            else:
                doomed.append(bm.faces[i]); n_ceil += 1
            continue
        if near_floor(c, wall_cap):
            n_loose_kept += r in loose
            continue
        if i in up and not floor_below(Vector((c.x, c.y, max(v.z for v in vs) + 0.05)), island_depth):
            n_island += 1
            continue
        doomed.append(bm.faces[i]); n_wall_cut += 1
    stats.update({"ceiling_removed": n_ceil, "lips_kept": n_lip, "high_faces_removed": n_wall_cut,
                  "floor_islands_kept": n_island, "loose_faces_kept": n_loose_kept})
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    stats["faces_kept"] = len(bm.faces)
    bm.to_mesh(cave.data)
    bm.free()
    cave.data.update()
    wrem = wkept = 0
    if water_support > 0:
        for ob in objs:
            if not is_liquid(ob):
                continue
            wb = bmesh.new()
            wb.from_mesh(ob.data)
            wmw = ob.matrix_world
            dead = []
            for f in wb.faces:
                c = sum((wmw @ v.co for v in f.verts), Vector()) / len(f.verts)
                if not floor_below(c + Vector((0, 0, 0.05)), water_support):
                    dead.append(f)
            wrem += len(dead)
            bmesh.ops.delete(wb, geom=dead, context="FACES")
            wkept += len(wb.faces)
            wb.to_mesh(ob.data)
            wb.free()
            ob.data.update()
    stats.update({"water_removed": wrem, "water_kept": wkept})
    log(f"support cull: {stats}")
    return stats


def world_bounds(objs, exclude_prefix=None, include_prefix=None):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for ob in objs:
        if exclude_prefix and ob.name.startswith(exclude_prefix):
            continue
        if include_prefix and not ob.name.startswith(include_prefix):
            continue
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def image_of(mat):
    if not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            return n.image
    return None


def wmo_blend(mat):
    return int(mat.name.rsplit("_b", 1)[-1]) if "_b" in mat.name else 0


def build_pbr(mat):
    """Principled node tree the glTF exporter understands."""
    img = image_of(mat)
    blend = wmo_blend(mat)
    liquid = mat.name.startswith("liquid")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    if liquid:
        bsdf.inputs["Base Color"].default_value = (0.30, 0.62, 0.85, 1)
        bsdf.inputs["Alpha"].default_value = 0.55
        bsdf.inputs["Roughness"].default_value = 0.15
        mat.surface_render_method = "BLENDED"
        mat.use_backface_culling = False
        return
    mat.use_backface_culling = True
    if img:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Linear"
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if blend > 0:
            clip = nt.nodes.new("ShaderNodeMath")
            clip.operation = "GREATER_THAN"
            clip.inputs[1].default_value = 0.5
            nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
            nt.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"


def centre(objs, lo, hi):
    """Move the model so bbox XY centre -> origin and z_min -> 0; return the offset applied."""
    off = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for ob in objs:
        ob.location = ob.location + off
    return off


def export_glb(path, image_format):
    kw = dict(filepath=path, export_format="GLB", export_image_format=image_format,
              export_texcoords=True, export_normals=True, export_materials="EXPORT",
              export_apply=True, export_yup=True, use_selection=False,
              export_animations=False, export_skins=False, export_morph=False,
              export_extras=False, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color="NONE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kw, export_colors=False)
    log(f"wrote {path} ({os.path.getsize(path) / 1e6:.1f} MB)")


def setup_cycles(scene, samples, shaded):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.max_bounces = 2 if shaded else 0
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.filter_width = 1.0
    scene.cycles.seed = 0
    scene.render.film_transparent = True
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    if shaded:
        bg.inputs["Color"].default_value = (0.75, 0.78, 0.85, 1)
        bg.inputs["Strength"].default_value = 0.8
        sun_data = bpy.data.lights.new("sun", "SUN")
        sun_data.energy = 3.0
        sun_data.angle = math.radians(8)
        sun = bpy.data.objects.new("sun", sun_data)
        scene.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(35), 0, math.radians(-45))
    else:
        bg.inputs["Strength"].default_value = 0.0
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def topdown_camera(lo, hi, width, rot_deg):
    size = hi - lo
    center = (lo + hi) / 2
    cam_data = bpy.data.cameras.new("top")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("top", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (center.x, center.y, hi.z + 50)
    cam.rotation_euler = (0, 0, math.radians(rot_deg))
    r = math.radians(rot_deg)
    w = abs(size.x * math.cos(r)) + abs(size.y * math.sin(r))
    h = abs(size.x * math.sin(r)) + abs(size.y * math.cos(r))
    cam_data.ortho_scale = max(w, h) * 1.02
    cam_data.clip_start = 0.1
    cam_data.clip_end = size.z + 1000
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.resolution_x = width if w >= h else int(round(width * w / h))
    scene.render.resolution_y = int(round(width * h / w)) if w >= h else width
    scene.render.resolution_percentage = 100


def height_output(scene):
    """16-bit RGBA PNG with NO view transform: "Standard" sRGB-encodes the grey (every height.png
    before 2026-10-18 is sRGB, their height.json says "encoding": "grey = ..." without "linear")."""
    scene.view_settings.view_transform = "Raw"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.render.image_settings.color_depth = "16"
    scene.render.image_settings.color_mode = "RGBA"


def height_material(mat, zlo, zhi):
    """Emission = (world z - zlo) / (zhi - zlo); back faces transparent."""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix_bf = nt.nodes.new("ShaderNodeMixShader")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(geom.outputs["Backfacing"], mix_bf.inputs["Fac"])
    nt.links.new(transp.outputs[0], mix_bf.inputs[2])
    nt.links.new(mix_bf.outputs[0], out.inputs["Surface"])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geom.outputs["Position"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = zlo
    mr.inputs["From Max"].default_value = zhi
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(mr.outputs[0], em.inputs["Color"])
    nt.links.new(em.outputs[0], mix_bf.inputs[1])


def persp_camera(objs, width, azimuth_deg, elev_deg, name):
    lo, hi = world_bounds(objs)
    size = hi - lo
    center = (lo + hi) / 2
    az, el = math.radians(azimuth_deg), math.radians(elev_deg)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    dist = size.length * 2
    cam_data = bpy.data.cameras.new(name)
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = center + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    # fit the 8 bbox corners in camera space
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for i in range(8):
        c = Vector((hi.x if i & 1 else lo.x, hi.y if i & 2 else lo.y, hi.z if i & 4 else lo.z))
        p = inv @ c
        xs.append(p.x)
        ys.append(p.y)
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    cam_data.ortho_scale = max(w, h) * 1.04
    cam_data.clip_start = 0.1
    cam_data.clip_end = dist * 3
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.resolution_x = width if w >= h else int(round(width * w / h))
    scene.render.resolution_y = int(round(width * h / w)) if w >= h else width
    scene.render.resolution_percentage = 100


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log(f"wrote {path}")

# ---------------------------------------------------------------- terrain (--kind terrain)

TILE_YARDS = 533.33333
# adt2obj.py writes true world coordinates; wmo2obj.py's frame negates both horizontal axes. A turn of
# 180 deg about z (a rotation, det +1: winding and normals survive) maps the first onto the second.
TO_PIPELINE_FRAME = Matrix.Diagonal((-1.0, -1.0, 1.0, 1.0))


def is_terrain(ob):
    return ob.name.startswith("terrain_")


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def edit(ob, fn):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    r = fn(bm)
    loose = [v for v in bm.verts if not v.link_faces]  # never leave vertices that widen the extent
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return r


def clip_to_frame(objs, lo, hi, framed):
    """Bisect every object that does not set the frame at the frame's x/y planes; drop the outside."""
    planes = [((hi.x, 0, 0), (1, 0, 0)), ((lo.x, 0, 0), (-1, 0, 0)),
              ((0, hi.y, 0), (0, 1, 0)), ((0, lo.y, 0), (0, -1, 0))]
    st = {"objects_clipped": 0, "faces_removed": 0}
    for ob in objs:
        if ob.name in framed:
            continue
        if ob.matrix_world != Matrix.Identity(4):
            raise SystemExit(f"{ob.name}: OBJ import gave a non-identity transform; clip planes assume world == local")
        blo, bhi = world_bounds([ob])
        if blo.x >= lo.x and bhi.x <= hi.x and blo.y >= lo.y and bhi.y <= hi.y:
            continue

        def cut(bm):
            n0 = len(bm.faces)
            for co, no in planes:
                bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-4,
                                       plane_co=co, plane_no=no, clear_outer=True)
            return n0 - len(bm.faces)
        st["faces_removed"] += edit(ob, cut)
        st["objects_clipped"] += 1
    return st


def filled_ground(fv, lo, hi):
    """Terrain height on its 4.17-yd vertex grid (outer MCNK vertices), holes filled by repeated averaging of
    known 4-neighbours (each pass reads the previous pass: order-independent, deterministic). Returns a
    bilinear h(x, y). A WMO that replaces the ground (Lordaeron's palace) sits in a terrain HOLE, so without
    this nothing under it is ever 'below terrain' and the Undercity beneath it survives the buried cull."""
    U = TILE_YARDS / 128
    known = {}
    for x, y, z in fv:
        i, j = x / U, y / U
        if abs(i - round(i)) < 1e-3 and abs(j - round(j)) < 1e-3:
            known[(round(i), round(j))] = z
    i0, i1 = math.floor(lo.x / U) - 1, math.ceil(hi.x / U) + 1
    j0, j1 = math.floor(lo.y / U) - 1, math.ceil(hi.y / U) + 1
    grid = dict(known)
    missing = [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1) if (i, j) not in grid]
    while missing:
        upd = {}
        for i, j in missing:
            nb = [grid[k] for k in ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)) if k in grid]
            if nb:
                upd[(i, j)] = sum(nb) / len(nb)
        if not upd:
            break
        grid.update(upd)
        missing = [k for k in missing if k not in upd]

    def h(x, y):
        fi, fj = x / U, y / U
        i, j = math.floor(fi), math.floor(fj)
        ti, tj = fi - i, fj - j
        g = lambda a, b: grid.get((a, b), grid.get((min(max(a, i0), i1), min(max(b, j0), j1)), 0.0))
        return ((1 - ti) * ((1 - tj) * g(i, j) + tj * g(i, j + 1)) + ti * ((1 - tj) * g(i + 1, j) + tj * g(i + 1, j + 1)))
    return h, len(known)


def bury_cull(objs, depth, hole_depth, straddle_depth, lo, hi):
    """Drop a non-terrain face iff every vertex is buried: terrain more than `depth` straight above it, or --
    where there is no terrain at that x/y (a hole) -- the vertex is more than `hole_depth` below the
    hole-filled ground AND solid (non-liquid) geometry covers it from above (the Undercity under the palace
    floor goes; a sunken pool's bottom, seen through its water, stays); OR its centroid is more than `straddle_depth` below the ground (one tall face running
    from the Undercity up past the surface, e.g. a lift shaft wall: a terrain block has no side walls, so it
    shows under the cut edge in any 3/4 view). Probes are clamped 1 cm inside the frame: a ray up from a
    vertex ON the frame edge grazes the terrain's border edge and misses."""
    from mathutils.bvhtree import BVHTree
    fv, fp = [], []
    for ob in objs:
        if is_terrain(ob):
            base = len(fv)
            fv.extend(tuple(v.co) for v in ob.data.vertices)
            fp.extend(tuple(base + i for i in p.vertices) for p in ob.data.polygons)
    bvh = BVHTree.FromPolygons(fv, fp, all_triangles=False, epsilon=0.0)
    ground, n_grid = filled_ground(fv, lo, hi)
    sv, sp = [], []  # every solid face (terrain + WMO + doodads), for 'is anything over this point?'
    for ob in objs:
        if not is_liquid(ob):
            base = len(sv)
            sv.extend(tuple(v.co) for v in ob.data.vertices)
            sp.extend(tuple(base + i for i in p.vertices) for p in ob.data.polygons)
    solid = BVHTree.FromPolygons(sv, sp, all_triangles=False, epsilon=0.0)
    up, down, eps = Vector((0, 0, 1)), Vector((0, 0, -1)), 0.01
    top = max(z for _, _, z in fv) + 1000
    st = {"faces_removed": 0, "faces_kept": 0, "ground_grid_points": n_grid, "vertices_under_holes": 0,
          "vertices_buried_in_holes": 0, "straddling_faces_removed": 0}

    def below(c):
        """-> (yards below the ground surface at c's x/y, in a hole?)"""
        x, y = min(max(c.x, lo.x + eps), hi.x - eps), min(max(c.y, lo.y + eps), hi.y - eps)
        hit = bvh.ray_cast(Vector((x, y, top)), down)[0]
        if hit is not None:
            return hit.z - c.z, False  # the highest terrain at x/y (a single heightfield sheet)
        return ground(x, y) - c.z, True

    def covered(c):
        return solid.ray_cast(c + Vector((0, 0, 0.1)), up)[0] is not None

    def buried(c, count=True):
        d, hole = below(c)
        b = d > depth if not hole else (d > hole_depth and covered(c))
        if count:
            st["vertices_under_holes"] += hole
            st["vertices_buried_in_holes"] += hole and b
        return b

    for ob in objs:
        if is_terrain(ob):
            continue

        def cut(bm):
            bur = {v: buried(v.co) for v in bm.verts}
            doomed = []
            for f in bm.faces:
                if all(bur[v] for v in f.verts):
                    doomed.append(f)
                elif below(f.calc_center_median())[0] > straddle_depth and (
                        not below(f.calc_center_median())[1] or covered(f.calc_center_median())):
                    doomed.append(f)
                    st["straddling_faces_removed"] += 1
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
            return len(doomed), len(bm.faces)
        d, k = edit(ob, cut)
        st["faces_removed"] += d
        st["faces_kept"] += k
    return st


def group_flags(raw, fid, gi, cache={}):
    """MOGP header flags of raw/wmo/<fid>/groups/group_<gi>.wmo (0x2000 = interior, 0x8 = exterior)."""
    import struct
    key = (fid, gi)
    if key not in cache:
        buf = open(os.path.join(raw, "wmo", str(fid), "groups", "group_%03d.wmo" % gi), "rb").read()
        i = buf.find(b"PGOM")  # chunk tags are stored reversed
        cache[key] = struct.unpack_from("<I", buf, i + 16)[0] if i >= 0 else 0
    return cache[key]


def roof_cull(objs, raw, min_drop, max_drop):
    """--roof-cull: open the buildings that HAVE interiors. FLOOR = upward faces (nz > 0.5) of a placement's
    interior groups (MOGP 0x2000); in every group of that placement (the dome and tower caps are exterior
    shells over interior rooms), a face with |nz| > 0.25 goes iff a FLOOR lies min_drop..max_drop straight
    below its centroid: a roof, a ceiling or an upper storey over a room. Walls stay."""
    import re
    from mathutils.bvhtree import BVHTree
    pat = re.compile(r"^wmo_(\d+)_(\d+_\d+)_(\d+)_group_(\d+)$")
    by_pl = {}
    for ob in objs:
        m = pat.match(ob.name)
        if m:
            interior = bool(group_flags(raw, int(m.group(1)), int(m.group(4))) & 0x2000)
            by_pl.setdefault(m.group(1, 2, 3), []).append((ob, interior))
    by_pl = {k: v for k, v in by_pl.items() if any(i for _, i in v)}
    st = {"placements_with_interiors": sorted("_".join(k) for k in by_pl), "interior_groups": 0, "faces_removed": 0}
    down = Vector((0, 0, -1))
    for key in sorted(by_pl):
        group = sorted(by_pl[key], key=lambda oi: oi[0].name)
        st["interior_groups"] += sum(i for _, i in group)
        fv, fp = [], []
        for ob, interior in group:
            if not interior:
                continue
            for p in ob.data.polygons:
                if p.normal.z > 0.5:
                    fp.append(tuple(range(len(fv), len(fv) + len(p.vertices))))
                    fv.extend(tuple(ob.data.vertices[i].co) for i in p.vertices)
        if not fp:
            continue
        bvh = BVHTree.FromPolygons(fv, fp, all_triangles=False, epsilon=0.0)
        for ob, _ in group:
            def cut(bm):
                doomed = []
                for f in bm.faces:
                    vs = [v.co for v in f.verts]
                    n = (vs[1] - vs[0]).cross(vs[2] - vs[0])
                    if n.length == 0 or abs(n.normalized().z) <= 0.25:
                        continue
                    c = sum(vs, Vector()) / len(vs)
                    if bvh.ray_cast(c - Vector((0, 0, min_drop)), down, max_drop - min_drop)[0] is not None:
                        doomed.append(f)
                bmesh.ops.delete(bm, geom=doomed, context="FACES")
                return len(doomed)
            st["faces_removed"] += edit(ob, cut)
    return st


def smooth_terrain(objs, prefix):
    """Same rule as blender_topdown.py --smooth-prefix: weld chunk borders, shade smooth."""
    for ob in objs:
        if ob.name.startswith(prefix):
            def weld(bm):
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3)
                for f in bm.faces:
                    f.smooth = True
            edit(ob, weld)


def shrink_atlases(objs, px_per_yard):
    """Downscale each tile's baked ground atlas to px_per_yard, then crop it to the UVs in use (a cropped map
    uses a strip of some tiles) and remap those UVs. Deterministic: Blender's box downscale + integer crop."""
    import numpy as np
    st = []
    for ob in sorted((o for o in objs if is_terrain(o)), key=lambda o: o.name):
        me = ob.data
        img = image_of(me.materials[0]) if me.materials else None
        if img is None or not me.uv_layers:
            continue
        uv = me.uv_layers.active.data
        src = list(img.size)
        n = round(TILE_YARDS * px_per_yard) if px_per_yard > 0 else src[0]
        if n < src[0]:
            img.scale(n, n)
        W, H = img.size
        us = np.empty(len(uv) * 2, dtype=np.float32)
        uv.foreach_get("uv", us)
        us = us.reshape(-1, 2)
        x0 = max(0, int(math.floor(us[:, 0].min() * W)) - 2)
        x1 = min(W, int(math.ceil(us[:, 0].max() * W)) + 2)
        y0 = max(0, int(math.floor(us[:, 1].min() * H)) - 2)
        y1 = min(H, int(math.ceil(us[:, 1].max() * H)) + 2)
        px = np.empty(W * H * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        crop = px.reshape(H, W, 4)[y0:y1, x0:x1].copy()
        out = bpy.data.images.new(ob.name + "_atlas", x1 - x0, y1 - y0, alpha=False)
        out.colorspace_settings.name = img.colorspace_settings.name
        out.pixels.foreach_set(crop.ravel())
        out.pack()
        us[:, 0] = (us[:, 0] * W - x0) / (x1 - x0)
        us[:, 1] = (us[:, 1] * H - y0) / (y1 - y0)
        uv.foreach_set("uv", us.ravel())
        for node in me.materials[0].node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image == img:
                node.image = out
        st.append({"object": ob.name, "source_px": src, "scaled_px": [W, H], "crop_px": [x1 - x0, y1 - y0]})
    return st


def prepare_terrain(a, cull=True):
    """Import, clip to the frame, cull. Returns objects (true world frame), frame lo/hi, stats."""
    objs = import_obj(a.obj)
    st = {"kind": "terrain", "faces_in": sum(len(o.data.polygons) for o in objs)}
    lo, hi = world_bounds(objs, a.frame_exclude_prefix, a.frame_include_prefix)
    framed = {o.name for o in objs if not (a.frame_exclude_prefix and o.name.startswith(a.frame_exclude_prefix))
              and not (a.frame_include_prefix and not o.name.startswith(a.frame_include_prefix))}
    st["clip"] = clip_to_frame(objs, lo, hi, framed)
    if cull and not a.keep_buried:
        st["buried"] = bury_cull(objs, a.bury_depth, a.hole_depth, a.straddle_depth, lo, hi)
    if cull and a.roof_cull:
        st["roof"] = roof_cull(objs, os.path.dirname(os.path.dirname(os.path.abspath(a.obj))),
                               a.roof_min_drop, a.roof_max_drop)
    for ob in [o for o in objs if not o.data.polygons]:
        bpy.data.objects.remove(ob, do_unlink=True)
    objs = meshes()
    if a.smooth_prefix:
        smooth_terrain(objs, a.smooth_prefix)
    st["faces_kept"] = sum(len(o.data.polygons) for o in objs)
    st["objects_kept"] = len(objs)
    src = {}
    for o in objs:  # terrain / liquid / wmo_<fid> / m2: where the faces (and the bytes) are
        k = "terrain" if is_terrain(o) else "liquid" if is_liquid(o) else "_".join(o.name.split("_")[:2])
        src[k] = src.get(k, 0) + len(o.data.polygons)
    st["faces_by_source"] = dict(sorted(src.items(), key=lambda kv: -kv[1]))
    log(f"terrain prepare (cull={cull}): {st}")
    return objs, lo, hi, st


def export_terrain_glb(a, path, cull, report):
    objs, flo, fhi, st = prepare_terrain(a, cull)
    wlo, whi = world_bounds(objs)
    atlases = shrink_atlases(objs, a.terrain_px_per_yard)
    for mat in bpy.data.materials:
        build_pbr(mat)
    solid = [o for o in objs if not is_liquid(o)]
    with bpy.context.temp_override(active_object=solid[0], selected_editable_objects=solid, selected_objects=solid):
        bpy.ops.object.join()
    solid[0].name = "terrain"
    objs = meshes()
    for ob in objs:
        ob.data.transform(TO_PIPELINE_FRAME)
    lo, hi = world_bounds(objs)
    off = centre(objs, lo, hi)
    export_glb(path, a.image_format)
    return objs, flo, fhi, wlo, whi, lo, hi, off, st, atlases


def main_terrain(a):
    report = {"kind": "terrain"}
    open_top = os.path.join(a.outdir, f"{a.slug}-open-top.glb")
    full = os.path.join(a.outdir, f"{a.slug}-full.glb")
    if not a.skip_full:
        export_terrain_glb(a, full, False, report)
    objs, flo, fhi, wlo, whi, lo, hi, off, st, atlases = export_terrain_glb(a, open_top, True, report)
    # bounds_wow / offset_applied: the pipeline frame (both horizontal world axes negated), exactly as the
    # WMO path; here they describe the exported (clipped, culled) geometry, i.e. the crop.
    report["bounds_wow"] = {"min": list(lo), "max": list(hi)}
    report["offset_applied"] = list(off)
    report["faces_full"] = st["faces_in"]
    report["faces_open_top"] = sum(len(o.data.polygons) for o in objs)
    report["support_cull"] = st
    report["support_cull_args"] = {"keep_buried": a.keep_buried, "bury_depth": a.bury_depth, "hole_depth": a.hole_depth,
                                   "straddle_depth": a.straddle_depth,
                                   "roof_cull": a.roof_cull,
                                   "roof_min_drop": a.roof_min_drop, "roof_max_drop": a.roof_max_drop,
                                   "frame_include_prefix": a.frame_include_prefix,
                                   "frame_exclude_prefix": a.frame_exclude_prefix, "smooth_prefix": a.smooth_prefix,
                                   "terrain_px_per_yard": a.terrain_px_per_yard}
    report["terrain_atlases"] = atlases
    report["frame_world"] = {"min": [flo.x, flo.y], "max": [fhi.x, fhi.y],
                             "note": "x/y of the top-down camera frame in TRUE world yards (terrain_ objects)"}

    # ---- height map: open-top, no liquid, TRUE world frame, the passes' camera (frame x/y, --rot)
    objs, _, _, _ = prepare_terrain(a, True)
    for ob in [o for o in objs if is_liquid(o)]:
        bpy.data.objects.remove(ob, do_unlink=True)
    for mat in bpy.data.materials:
        height_material(mat, wlo.z, whi.z)
    topdown_camera(Vector((flo.x, flo.y, wlo.z)), Vector((fhi.x, fhi.y, whi.z)), a.height_width, a.rot)
    scene = bpy.context.scene
    setup_cycles(scene, 4, shaded=False)
    height_output(scene)
    render(os.path.join(a.outdir, "height.png"))
    report["height"] = {"z_min": wlo.z, "z_max": whi.z, "rot": a.rot, "width": a.height_width,
                        "encoding": "linear: grey = (z - z_min) / (z_max - z_min), 16-bit; alpha 0 = no geometry",
                        "frame": "identical camera to blender_topdown.py (terrain_ x/y frame, z from everything, ortho, rot)"}

    perspective_proofs(a, report, open_top, full)
    json.dump(report, open(os.path.join(a.outdir, "height.json"), "w"), indent=2)
    log(json.dumps(report, indent=1))



def main():
    a = parse()
    os.makedirs(a.outdir, exist_ok=True)
    if a.kind == "terrain":
        return main_terrain(a)
    report = {}

    # ---- full model
    objs = import_obj(a.obj)
    lo, hi = world_bounds(objs)
    report["bounds_wow"] = {"min": list(lo), "max": list(hi)}
    for mat in bpy.data.materials:
        build_pbr(mat)
    off = centre(objs, lo, hi)
    report["offset_applied"] = list(off)
    report["faces_full"] = sum(len(o.data.polygons) for o in objs)
    seed_exclude = tuple(t.strip().lower() for t in a.seed_exclude.split(",") if t.strip())
    full = os.path.join(a.outdir, f"{a.slug}-full.glb")
    if not a.skip_full:
        export_glb(full, a.image_format)

    # ---- open-top model (same ceiling rule as blender_topdown.py)
    objs = import_obj(a.obj)
    objs = join_solid(objs)
    report["support_cull"] = support_cull(objs, a.weld, a.seed_min_area, a.wall_cap, a.water_support, a.island_depth,
                                          a.ceiling_thresh, a.undercut_cap, a.rest_tol, a.prop_max_height, seed_exclude)
    report["support_cull_args"] = {"weld": a.weld, "seed_min_area": a.seed_min_area, "wall_cap": a.wall_cap,
                                   "water_support": a.water_support, "island_depth": a.island_depth, "ceiling_thresh": a.ceiling_thresh,
                                   "undercut_cap": a.undercut_cap, "rest_tol": a.rest_tol, "prop_max_height": a.prop_max_height}
    if seed_exclude:
        report["support_cull_args"]["seed_exclude"] = list(seed_exclude)
    for mat in bpy.data.materials:
        build_pbr(mat)
    centre(objs, lo, hi)  # same offset as the full model, so the two GLBs overlay exactly
    open_top = os.path.join(a.outdir, f"{a.slug}-open-top.glb")
    export_glb(open_top, a.image_format)

    # ---- height map: open-top, no liquid, raw WoW frame (same camera as the top-down passes)
    objs = import_obj(a.obj)
    objs = join_solid(objs)
    support_cull(objs, a.weld, a.seed_min_area, a.wall_cap, a.water_support, a.island_depth,
                 a.ceiling_thresh, a.undercut_cap, a.rest_tol, a.prop_max_height, seed_exclude)
    for ob in [o for o in objs if is_liquid(o)]:
        bpy.data.objects.remove(ob, do_unlink=True)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for mat in bpy.data.materials:
        height_material(mat, lo.z, hi.z)
    topdown_camera(lo, hi, a.height_width, a.rot)
    scene = bpy.context.scene
    setup_cycles(scene, 4, shaded=False)
    height_output(scene)
    render(os.path.join(a.outdir, "height.png"))
    report["height"] = {"z_min": lo.z, "z_max": hi.z, "rot": a.rot, "width": a.height_width,
                        "encoding": "linear: grey = (z - z_min) / (z_max - z_min), 16-bit; alpha 0 = no geometry",
                        "frame": "identical camera to blender_topdown.py (full-model bounds, ortho, rot)"}

    perspective_proofs(a, report, open_top, full)
    json.dump(report, open(os.path.join(a.outdir, "height.json"), "w"), indent=2)
    log(json.dumps(report, indent=1))


def perspective_proofs(a, report, open_top, full):
    """3/4 views rendered from the RE-IMPORTED GLBs (proves they round-trip)."""
    for variant, path in (("open-top", open_top), ("full", full)):
        if not os.path.exists(path):
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        for mat in bpy.data.materials:  # Cycles ignores use_backface_culling: make back faces transparent
            if mat.use_backface_culling and mat.node_tree:
                nt = mat.node_tree
                out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
                surf = out.inputs["Surface"].links[0].from_socket
                mix = nt.nodes.new("ShaderNodeMixShader")
                geom = nt.nodes.new("ShaderNodeNewGeometry")
                transp = nt.nodes.new("ShaderNodeBsdfTransparent")
                nt.links.new(geom.outputs["Backfacing"], mix.inputs["Fac"])
                nt.links.new(surf, mix.inputs[1])
                nt.links.new(transp.outputs[0], mix.inputs[2])
                nt.links.new(mix.outputs[0], out.inputs["Surface"])
        log(f"re-imported {path}: {len(objs)} meshes, {sum(len(o.data.polygons) for o in objs)} faces, "
            f"{len(bpy.data.images)} images")
        report.setdefault("reimport", {})[variant] = {
            "meshes": len(objs), "faces": sum(len(o.data.polygons) for o in objs),
            "images": len(bpy.data.images), "materials": len(bpy.data.materials)}
        # glTF importer converts back to Z-up. Look from the map's south (-X) toward north (+X).
        persp_camera(objs, a.persp_width, azimuth_deg=200, elev_deg=40, name="persp")
        setup_cycles(bpy.context.scene, 32, shaded=True)
        render(os.path.join(a.outdir, f"perspective-{variant}.png"))


main()
