"""Floor-patch table for the support cull (tools/export_glb.py): area, z range, faces, and how many
faces of each upward patch sit above other floor. The input for the not-yet-built "stacked patch"
knob (README "3D export"). Blender -b -P tools/diag_floor_patches.py -- <obj>  (cwd = scripts/render-map)."""
import sys, math, bmesh, bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=sys.argv[sys.argv.index("--") + 1], forward_axis="Y", up_axis="Z")
objs=[o for o in bpy.context.scene.objects if o.type=="MESH"]
solid=[o for o in objs if not o.name.startswith("liquid")]
with bpy.context.temp_override(active_object=solid[0], selected_editable_objects=solid, selected_objects=solid): bpy.ops.object.join()
cave=solid[0]; bm=bmesh.new(); bm.from_mesh(cave.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01); bm.faces.ensure_lookup_table()
W={f.index:[cave.matrix_world@v.co for v in f.verts] for f in bm.faces}
def nrm(vs):
    n=(vs[1]-vs[0]).cross(vs[2]-vs[0]); return (n.normalized().z if n.length>0 else 0.0, n.length/2)
up={i for i,vs in W.items() if nrm(vs)[0]>0.5}
parent={i:i for i in up}
def find(i):
    while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
    return i
for i in up:
    for e in bm.faces[i].edges:
        for g in e.link_faces:
            if g.index in parent and g.index!=i: parent[find(i)]=find(g.index)
area={}; members={}
for i in up: r=find(i); area[r]=area.get(r,0)+nrm(W[i])[1]; members.setdefault(r,[]).append(i)
big=sorted(area.items(), key=lambda kv:-kv[1])
print("patches >=10:", sum(1 for _,a in big if a>=10), "total walkable area %.0f"%sum(area.values()), file=sys.stderr)
cum=0; tot=sum(area.values())
# BVH of the top-20 patches to test whether a patch sits above other floor
top=set(r for r,_ in big[:20]); fv,fp=[],[]
for r in top:
    for i in members[r]:
        fv.extend(tuple(v) for v in W[i]); fp.append(tuple(range(len(fv)-len(W[i]),len(fv))))
bvh=BVHTree.FromPolygons(fv,fp,all_triangles=False,epsilon=0.0); down=Vector((0,0,-1))
print("rank  area   cum%   zmin..zmax   faces  below(any of top20 within 40 under its centroid?)", file=sys.stderr)
for k,(r,a) in enumerate(big[:60]):
    cum+=a; zs=[v.z for i in members[r] for v in W[i]]
    cs=[sum(W[i],Vector())/len(W[i]) for i in members[r]]
    hits=sum(1 for c in cs if bvh.ray_cast(c+Vector((0,0,-0.5)),down,40)[0] is not None)
    print(f"{k:3d} {a:8.0f} {100*cum/tot:5.1f}  {min(zs):7.1f}..{max(zs):6.1f}  {len(members[r]):6d}  {hits}/{len(cs)}", file=sys.stderr)
