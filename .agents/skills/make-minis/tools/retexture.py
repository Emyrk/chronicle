"""Meshy retexture of an approved mesh, front still as the style image (10 credits). Meshy allows 10 PENDING tasks:
an 11th returns 429 NoMorePendingTasks, creates nothing and charges nothing, so run batches of <=10.
usage: retexture.py <dungeon> <boss>   (paths are relative to the configured workdir; keys from env or local.yaml env_file)"""
import json, os, sys, time, datetime
_MM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "scripts", "mini-maker")
sys.path.insert(0, os.path.join(_MM, "scripts"))
from mini_lib import config
config.enter()
from mini_lib import meshy

D, B = sys.argv[1], sys.argv[2]
key = os.environ["MESHY_API_KEY"]
meta = json.load(open(f"work/{D}/{B}/meta.json"))
assert meta["mesh_status"] == "mesh_approved", "mesh not approved"
src_task = meta["meshy"]["task_id"]
front = open(f"work/{D}/{B}/front.png", "rb").read()
body = {"input_task_id": src_task, "image_style_url": meshy._data_uri(front),
        "ai_model": "latest", "texture_resolution": "2k", "enable_pbr": False,
        "enable_original_uv": False, "target_formats": ["glb"]}
r = meshy.http_transport("POST", "/retexture", key, body)
tid = r["result"]; print(B, "retexture task", tid, flush=True)
while True:
    t = meshy.http_transport("GET", f"/retexture/{tid}", key)
    if t["status"] in ("SUCCEEDED", "FAILED", "CANCELED"): break
    time.sleep(8)
out = f"dungeons/{D}/{B}/textured"; os.makedirs(out, exist_ok=True)
json.dump({k: t.get(k) for k in ("id", "status", "consumed_credits", "texture_urls", "task_error")}, open(f"{out}/task.json", "w"), indent=1)
cred = t.get("consumed_credits")
row = f"| {datetime.date.today()} | {D}/{B} | retexture | front still as image_style_url | ai_model=latest, 2k, no PBR, orig-UV off | {cred} | {t['status'].lower()} | task {tid} (retexture of {src_task}); the operator asked for it {datetime.date.today()} |\n"
open("meshy-tests/LOG.md", "a").write(row)
if t["status"] != "SUCCEEDED": sys.exit(f"{B}: {t['status']} {t.get('task_error')}")
open(f"{out}/raw-textured.glb", "wb").write(meshy.download_transport(t["model_urls"]["glb"]))
bc = (t.get("texture_urls") or [{}])[0].get("base_color")
if bc: open(f"{out}/base_color.png", "wb").write(meshy.download_transport(bc))
print(B, "OK", cred, "credits ->", out)
