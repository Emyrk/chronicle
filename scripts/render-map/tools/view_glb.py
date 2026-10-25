"""Proof render of a GLB (what a back-face-culling viewer shows), whole map or a close-up on the
largest water body, or any point. Blender -b -P tools/view_glb.py -- --glb X --out Y [--az 250 --el 35 --focus all|liquid-largest|X,Y --extent 220].
--focus X,Y = close-up centred on a point in the imported (centred) scene: pipeline x/y + height.json offset_applied x/y."""
import argparse, math, sys, bpy
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
p = argparse.ArgumentParser(); p.add_argument("--glb", required=True); p.add_argument("--out", required=True)
p.add_argument("--az", type=float, default=250); p.add_argument("--el", type=float, default=35)
p.add_argument("--width", type=int, default=1600); p.add_argument("--focus", default="liquid-largest"); p.add_argument("--extent", type=float, default=220)
a = p.parse_args(argv)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.glb)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for mat in bpy.data.materials:
    if mat.use_backface_culling and mat.node_tree:
        nt = mat.node_tree; out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        surf = out.inputs["Surface"].links[0].from_socket
        mix = nt.nodes.new("ShaderNodeMixShader"); geom = nt.nodes.new("ShaderNodeNewGeometry"); tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        nt.links.new(geom.outputs["Backfacing"], mix.inputs["Fac"]); nt.links.new(surf, mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs["Surface"])
def bounds(obs):
    lo = Vector((math.inf,)*3); hi = Vector((-math.inf,)*3)
    for ob in obs:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi
if a.focus == "liquid-largest":
    liq = [o for o in objs if o.name.startswith("liquid")]
    best = max(liq, key=lambda o: (lambda lo, hi: (hi - lo).x * (hi - lo).y)(*bounds([o])))
    lo, hi = bounds([best]); center = (lo + hi) / 2; ext = a.extent
    print("focus", best.name, "center", tuple(round(v, 1) for v in center), file=sys.stderr)
elif "," in a.focus:
    lo, hi = bounds(objs); fx, fy = map(float, a.focus.split(",")); center = Vector((fx, fy, (lo.z + hi.z) / 2)); ext = a.extent
else:
    lo, hi = bounds(objs); center = (lo + hi) / 2; ext = max((hi - lo).x, (hi - lo).y) * 1.05
az, el = math.radians(a.az), math.radians(a.el)
d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
cam_data = bpy.data.cameras.new("c"); cam_data.type = "ORTHO"; cam_data.ortho_scale = ext; cam_data.clip_end = 5000
cam = bpy.data.objects.new("c", cam_data); bpy.context.scene.collection.objects.link(cam)
cam.location = center + d * 1500; cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
sc = bpy.context.scene; sc.camera = cam; sc.render.resolution_x = a.width; sc.render.resolution_y = int(a.width * 0.75)
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 32; sc.cycles.use_denoising = False; sc.cycles.use_adaptive_sampling = False; sc.cycles.seed = 0
sc.cycles.max_bounces = 2; sc.cycles.transparent_max_bounces = 8; sc.render.film_transparent = True
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = (0.75, 0.78, 0.85, 1); bg.inputs["Strength"].default_value = 0.8
sd = bpy.data.lights.new("sun", "SUN"); sd.energy = 3.0; sd.angle = math.radians(8); sun = bpy.data.objects.new("sun", sd); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(35), 0, math.radians(-45))
sc.view_settings.view_transform = "Standard"; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"; sc.render.filepath = a.out
bpy.ops.render.render(write_still=True); print("wrote", a.out, file=sys.stderr)
