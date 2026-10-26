"""Top-down textured render of a WMO OBJ (from tools/wmo2obj.py) with ceilings removed.

Usage (Blender 4.3, headless):
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender_topdown.py -- \
      --obj raw/wc-forever-70374/obj/wc.obj --out inputs/wc-textured-dry.png --width 2400 --rot 90 \
      [--shaded] [--no-liquid | --liquid-only | --water-mask] [--floors-only] [--keep-ceiling]

Passes (Cycles on CPU: deterministic. Workbench on macOS/Metal dropped random geometry
between identical runs, so it is only kept behind --engine workbench):
  default      : albedo. Every texture goes through an Emission shader, so the pixel IS the
                 texel: no lighting, no shading. Water (liquid_*) renders flat blue.
  --shaded     : diffuse + sun from above + grey sky: depth cues for ledges and stairs.
  --water-mask : floors flat white, water flat blue, depth-tested -> a bridge above the water
                 hides it. composite_water.py turns this into the tinted overlay.
  --no-liquid  : drop the liquid_* objects (dry floor for composite_water.py).
  --liquid-only: only the liquid_* objects.
  --floors-only: also drop walls (keep faces whose up-normal > 0.5).
  --keep-ceiling: skip the ceiling cull.
  --rot 90     : matches inputs/wc-real.png (WoW -Y -> screen right, -X -> screen down).
Geometry facing down (ceilings) is deleted before rendering; back faces are made transparent
with a shader so a surviving steep face seen from behind does not paint over the floor.
Output is PNG with transparent background (alpha = not-geometry). The camera frame is
computed from the FULL model before any object is dropped, so all passes share one frame.
"""
import argparse
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--obj", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--width", type=int, default=2400)
    p.add_argument("--rot", type=float, default=0.0, help="camera roll in degrees")
    p.add_argument("--ceiling-thresh", type=float, default=-0.15,
                   help="delete faces whose world normal.z < this (downward-facing = ceiling)")
    p.add_argument("--floors-only", action="store_true")
    p.add_argument("--keep-ceiling", action="store_true")
    p.add_argument("--shaded", action="store_true")
    p.add_argument("--no-liquid", action="store_true")
    p.add_argument("--object-include-prefix", default=None,
                   help="comma-separated object-name prefixes to keep before framing/rendering")
    p.add_argument("--object-exclude-prefix", default=None,
                   help="comma-separated object-name prefixes to drop before framing/rendering")
    p.add_argument("--z-min", type=float, default=None, help="bisect geometry below this world Z before framing/rendering")
    p.add_argument("--z-max", type=float, default=None, help="bisect geometry above this world Z before framing/rendering")
    p.add_argument("--frame-exclude-prefix", default=None,
                   help="object-name prefix left out of the camera-frame bounds (e.g. m2_: doodads must not move the frame)")
    p.add_argument("--frame-include-prefix", default=None,
                   help="only objects with this name prefix set the camera frame (terrain_: a cropped terrain map "
                        "must not be widened by a WMO whose origin is inside the crop but whose body is not)")
    p.add_argument("--smooth-prefix", default=None,
                   help="objects with this name prefix are welded (doubles removed) and shaded smooth (terrain_: "
                        "the heightmap's 4.17-yard triangles facet visibly under the sun otherwise)")
    p.add_argument("--liquid-only", action="store_true")
    p.add_argument("--water-mask", action="store_true")
    p.add_argument("--engine", choices=["cycles", "workbench"], default="cycles")
    p.add_argument("--samples", type=int, default=None, help="Cycles samples (default 4 flat / 32 shaded)")
    return p.parse_args(argv)


def import_obj(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # wmo2obj.py writes raw WoW coordinates (Z-up): identity axes.
    bpy.ops.wm.obj_import(filepath=path, forward_axis="Y", up_axis="Z")
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    print(f"imported {len(objs)} objects, {sum(len(o.data.polygons) for o in objs)} faces", file=sys.stderr)
    return objs


def prefixes(value):
    return tuple(v.strip() for v in (value or "").split(",") if v.strip())


def select_geometry(objs, include_value=None, exclude_value=None, z_min=None, z_max=None):
    """Apply explicit object-prefix and world-Z selectors before any frame or pass-specific cull."""
    includes, excludes = prefixes(include_value), prefixes(exclude_value)
    drop = [o for o in objs if (includes and not o.name.startswith(includes)) or o.name.startswith(excludes)]
    keep = [o for o in objs if o not in drop]
    for ob in drop:
        bpy.data.objects.remove(ob, do_unlink=True)
    objs = keep
    clipped = faces_removed = 0
    if z_min is not None or z_max is not None:
        planes = []
        if z_max is not None:
            planes.append(((0, 0, z_max), (0, 0, 1)))
        if z_min is not None:
            planes.append(((0, 0, z_min), (0, 0, -1)))
        for ob in objs:
            if ob.matrix_world != Matrix.Identity(4):
                raise SystemExit(f"{ob.name}: OBJ import gave a non-identity transform; Z slice assumes world == local")
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            before = len(bm.faces)
            for co, no in planes:
                bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-4,
                                       plane_co=co, plane_no=no, clear_outer=True)
            loose = [v for v in bm.verts if not v.link_faces]
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
            faces_removed += before - len(bm.faces)
            bm.to_mesh(ob.data)
            bm.free()
            ob.data.update()
            clipped += 1
        for ob in [o for o in objs if not o.data.polygons]:
            bpy.data.objects.remove(ob, do_unlink=True)
        objs = [o for o in objs if o.data.polygons]
    if not objs:
        raise SystemExit("floor selection removed all mesh objects")
    print(f"selection kept={len(objs)} excluded={len(drop)} z_clipped={clipped} faces_removed={faces_removed}",
          file=sys.stderr)
    return objs


def is_liquid(ob):
    return ob.name.startswith("liquid")


def cull_faces(objs, ceiling_thresh, floors_only):
    removed = kept = 0
    for ob in objs:
        if is_liquid(ob):
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        mw = ob.matrix_world
        doomed = []
        for f in bm.faces:
            vs = [mw @ v.co for v in f.verts]
            n = (vs[1] - vs[0]).cross(vs[2] - vs[0])  # geometric normal, never stale
            nz = n.normalized().z if n.length > 0 else 0.0
            if nz < ceiling_thresh or (floors_only and nz < 0.5):
                doomed.append(f)
        removed += len(doomed)
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        kept += len(bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    print(f"faces removed={removed} kept={kept}", file=sys.stderr)


def world_bounds(objs, exclude_prefix=None, include_prefix=None):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    found = False
    for ob in objs:
        if exclude_prefix and ob.name.startswith(exclude_prefix):
            continue
        if include_prefix and not ob.name.startswith(include_prefix):
            continue
        for v in ob.data.vertices:
            found = True
            w = ob.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    if not found:
        raise SystemExit("camera frame selectors matched no geometry")
    return lo, hi


def smooth_objects(objs, prefix):
    """Weld duplicate vertices (chunk borders share positions but not vertices) and shade smooth, so vertex
    normals blend across the whole tile instead of faceting per triangle. Deterministic (pure topology)."""
    n = 0
    for ob in objs:
        if not ob.name.startswith(prefix):
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3)
        for f in bm.faces:
            f.smooth = True
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        n += 1
    print(f"smooth-shaded {n} objects with prefix {prefix}", file=sys.stderr)


def add_camera(lo, hi, width, rot_deg):
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
    print(f"bounds lo={tuple(round(c, 2) for c in lo)} hi={tuple(round(c, 2) for c in hi)} "
          f"res={scene.render.resolution_x}x{scene.render.resolution_y} ortho_scale={cam_data.ortho_scale:.2f}",
          file=sys.stderr)


# ---------------------------------------------------------------- materials (Cycles)

def image_of(mat):
    if not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            return n.image
    return None


def wmo_blend(mat):
    """wmo2obj names materials mat_<i>_b<blend>: 0 opaque, 1 alpha-key, 2+ blended."""
    return int(mat.name.rsplit("_b", 1)[-1]) if "_b" in mat.name else 0


def build_material(mat, mode):
    """Rebuild the node tree. mode: albedo | shaded | water_mask.
    Back faces become transparent (Cycles has no backface culling)."""
    img = image_of(mat)
    blend = wmo_blend(mat)
    liquid = mat.name.startswith("liquid")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix_bf = nt.nodes.new("ShaderNodeMixShader")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(mix_bf.outputs[0], out.inputs["Surface"])
    if not liquid:
        # back faces transparent (Cycles has no backface culling)
        nt.links.new(geom.outputs["Backfacing"], mix_bf.inputs["Fac"])
        nt.links.new(transp.outputs[0], mix_bf.inputs[2])
    else:
        mix_bf.inputs["Fac"].default_value = 0.0  # water is double-sided: readable from above whatever its winding

    if mode == "water_mask":
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (0, 0, 1, 1) if liquid else (1, 1, 1, 1)
        front = em
    elif liquid:
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (0.30, 0.62, 0.85, 1)
        front = em
    else:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Linear"
        if mode == "shaded":
            front = nt.nodes.new("ShaderNodeBsdfDiffuse")
        else:
            front = nt.nodes.new("ShaderNodeEmission")
        if img:
            nt.links.new(tex.outputs["Color"], front.inputs["Color"])
        if img and blend > 0:
            # alpha-keyed decal: texel alpha -> transparent
            mix_a = nt.nodes.new("ShaderNodeMixShader")
            nt.links.new(tex.outputs["Alpha"], mix_a.inputs["Fac"])
            nt.links.new(transp.outputs[0], mix_a.inputs[1])
            nt.links.new(front.outputs[0], mix_a.inputs[2])
            front = mix_a
    nt.links.new(front.outputs[0], mix_bf.inputs[1])


def setup_cycles(scene, mode, samples):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.max_bounces = 2 if mode == "shaded" else 0
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.filter_width = 1.0
    scene.cycles.seed = 0
    scene.render.film_transparent = True
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    if mode == "shaded":
        bg.inputs["Color"].default_value = (0.75, 0.78, 0.85, 1)
        bg.inputs["Strength"].default_value = 0.8
        sun_data = bpy.data.lights.new("sun", "SUN")
        sun_data.energy = 3.0
        sun_data.angle = math.radians(8)
        sun = bpy.data.objects.new("sun", sun_data)
        scene.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(35), 0, math.radians(-45))  # low-ish, from the NW
    else:
        bg.inputs["Strength"].default_value = 0.0


def setup_workbench(scene, mode):
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.color_type = "MATERIAL" if mode == "water_mask" else "TEXTURE"
    sh.show_backface_culling = True
    sh.light = "STUDIO" if mode == "shaded" else "FLAT"
    sh.show_cavity = mode == "shaded"
    scene.render.film_transparent = True
    for mat in bpy.data.materials:
        mat.use_backface_culling = not mat.name.startswith("liquid")
        if mode == "water_mask":
            mat.diffuse_color = (0, 0, 1, 1) if mat.name.startswith("liquid") else (1, 1, 1, 1)
        elif mat.name.startswith("liquid"):
            mat.diffuse_color = (0.30, 0.62, 0.85, 1)


def main():
    a = parse()
    mode = "water_mask" if a.water_mask else ("shaded" if a.shaded else "albedo")
    objs = import_obj(a.obj)
    objs = select_geometry(objs, a.object_include_prefix, a.object_exclude_prefix, a.z_min, a.z_max)
    # frame from the FULL selected model (before any pass-specific drop/cull), so every pass shares one camera
    lo, hi = world_bounds(objs, a.frame_exclude_prefix, a.frame_include_prefix)
    if a.frame_exclude_prefix or a.frame_include_prefix:
        # x/y from the framed objects, z from everything: the camera sits above hi.z, and a palace
        # dome taller than the framed terrain would otherwise be cut off (Lordaeron, walls crop)
        lo_all, hi_all = world_bounds(objs)
        lo.z, hi.z = lo_all.z, hi_all.z
    if a.no_liquid or a.liquid_only:
        drop = is_liquid if a.no_liquid else (lambda o: not is_liquid(o))
        keep = [o for o in objs if not drop(o)]
        for ob in [o for o in objs if drop(o)]:
            bpy.data.objects.remove(ob, do_unlink=True)
        objs = keep
    if not a.keep_ceiling:
        cull_faces(objs, a.ceiling_thresh, a.floors_only)
    if a.smooth_prefix:
        smooth_objects(objs, a.smooth_prefix)
    add_camera(lo, hi, a.width, a.rot)
    scene = bpy.context.scene
    if a.engine == "cycles":
        for mat in bpy.data.materials:
            build_material(mat, mode)
        setup_cycles(scene, mode, a.samples or (32 if mode == "shaded" else 4))
    else:
        setup_workbench(scene, mode)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = a.out
    bpy.ops.render.render(write_still=True)
    print(f"wrote {a.out}", file=sys.stderr)


main()
