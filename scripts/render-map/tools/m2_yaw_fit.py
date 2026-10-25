"""M2 yaw-offset fit: collinearity of same-model chains of elongated doodads vs yaw offset.
Run from scripts/render-map/ as: .venv/bin/python -I tools/m2_yaw_fit.py   (slug hard-wired to ruins-of-lordaeron;
reads <workdir>/maps/ruins-of-lordaeron/raw).
Result 2026-10-14: offsets 0/180 score +0.74, 90/270 -0.74; ry sign + (negated ry ~0). Default 180 kept."""
import sys,glob,struct,math
import os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import numpy as np, m2obj, adt2obj, rmconfig
raw=os.path.join(rmconfig.workdir(),'maps/ruins-of-lordaeron/raw')
inst=[]
for p in sorted(glob.glob(raw+'/adt/*_obj0.adt')):
    inst+=adt2obj.read_obj0_mddf(p)
shape={}
for f in {i['fid'] for i in inst}:
    m=m2obj.load(raw,f)
    if not m: continue
    P=[p['verts'] for p in m['parts'] if p['blend']<3 and len(p['tris'])]
    if not P: continue
    V=np.vstack(P)[:,:2]; V=V-V.mean(0)
    w,vec=np.linalg.eigh(np.cov(V.T))
    ext=np.ptp(V@vec[:,1])
    shape[f]=(math.sqrt(max(w[1],1e-9)/max(w[0],1e-9)),vec[:,1],ext)
els=[i for i in inst if i['fid'] in shape and shape[i['fid']][0]>2.5 and shape[i['fid']][2]*i['scale']>4]
print('elongated',len(els),'models',len({i['fid'] for i in els}))
# neighbors: same fid, centre distance in [0.6,2.2]*length
byf={}
for i in els: byf.setdefault(i['fid'],[]).append(i)
pairs=[]
for f,L in byf.items():
    ln=shape[f][2]
    for a in range(len(L)):
        P=np.array([[x['pos'][0],x['pos'][2]] for x in L])
        d=np.hypot(*(P-P[a]).T)
        for b in range(a+1,len(L)):
            if 0.5*ln*L[a]['scale']<d[b]<2.2*ln*L[a]['scale']:
                pairs.append((L[a],L[b]))
print('pairs',len(pairs))
def axis_world(i,off,sy=1):
    i={**i,"rot":(i["rot"][0],i["rot"][1]*sy,i["rot"][2])}
    ax=shape[i['fid']][1]
    pts=np.array([[0,0,0],[ax[0]*5,ax[1]*5,0]])
    W=adt2obj.place_m2_vertices(pts,i,off)
    return math.atan2(W[1,1]-W[0,1],W[1,0]-W[0,0])
def cen(i): return np.array([adt2obj.MAPC-i['pos'][2],adt2obj.MAPC-i['pos'][0]])

for sy in (1,-1):
    for off in (0,90,180,270):
        sc=[]
        for a,b in pairs:
            d=cen(b)-cen(a); phi=math.atan2(d[1],d[0])
            for i in (a,b): sc.append(math.cos(2*(axis_world(i,off,sy)-phi)))
        print('sy',sy,'off',off,round(float(np.mean(sc)),3))
# tighter: only pairs where both fit within 10 deg
