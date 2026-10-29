"""Publish textured minis to the Chronicle Miniature Foundry (shared by EVERY Chronicle server: needs the operator's explicit go).
usage: chronicle_publish.py plan.json [--publish]   (plan.json: absolute path or relative to the cwd; "file" entries are relative to the workdir)
plan.json: [{"name": "zg-jeklik", "file": "dungeons/zul-gurub/jeklik/textured/play-grounded.glb", "entry_ids": [14517]}, ...]
Without --publish: checks grounding, uploads assets, saves the draft and prints the diff (draft is visible to nobody).
With --publish: also publishes and verifies the manifest + every GLB (200 at local size).
Entries are matched by name: an existing name has its path/entry_ids replaced, a new one is appended."""
import json, os, random, re, subprocess, sys, urllib.request
_MM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "scripts", "mini-maker")
sys.path.insert(0, os.path.join(_MM, "scripts"))
from mini_lib import config
API = config.CFG["foundry"]["api"]  # local.yaml foundry.api; default is the production Miniature Foundry
CDN = config.CFG["foundry"]["cdn"]

def cf(*args):
    # cloudflared 2026.10 wants the URL straight after `curl`, before any curl flag
    out = subprocess.run(["cloudflared", "access", "curl", args[0], "-s", *args[1:]], capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def bbox(path):
    out = subprocess.run(["npx", "-y", "@gltf-transform/cli@4.5.0", "inspect", path], capture_output=True, text=True).stdout
    out = re.sub(r"\x1b\[[0-9;]*m", "", out)
    for line in out.splitlines():
        cells = [c.strip() for c in line.split("│")]
        if len(cells) > 5 and cells[1] == "0" and "," in cells[4]:
            return [float(v) for v in cells[4].split(",")], [float(v) for v in cells[5].split(",")]
    sys.exit(f"{path}: could not read scene bbox")

plan = json.load(open(sys.argv[1])); config.enter(); publish = "--publish" in sys.argv
state = cf(API)
if state["has_draft"]: sys.exit("a draft is already pending: stop and ask the operator")
for p in plan:
    lo, hi = bbox(p["file"])
    if abs(lo[1]) > 1e-3 or not 0.4 < hi[1] < 2.5:
        sys.exit(f"{p['name']}: not grounded (bboxMin y={lo[1]}, height={hi[1]}): run tools/ground.py first")
minis = state["published"]["miniatures"]
ids = {e: m["name"] for m in minis for e in m["entry_ids"]}
for p in plan:
    clash = [e for e in p["entry_ids"] if ids.get(e, p["name"]) != p["name"]]
    if clash: sys.exit(f"{p['name']}: entry ids {clash} already belong to another mini")
    p["path"] = cf(API + "/assets", "-X", "POST", "-F", f"file=@{p['file']}")["path"]
    entry = {"name": p["name"], "path": p["path"], "entry_ids": p["entry_ids"]}
    i = next((i for i, m in enumerate(minis) if m["name"] == p["name"]), None)
    print(("replace " if i is not None else "add     ") + p["name"], p["path"])
    if i is None: minis.append(entry)
    else: minis[i] = entry
saved = cf(API + "/draft", "-X", "PUT", "-H", "Content-Type: application/json", "--data", json.dumps({"version": None, "miniatures": minis}))
print("draft saved:", len(saved["draft"]["miniatures"]), "entries")
if not publish: sys.exit("not published (pass --publish once the operator has said yes)")
print(cf(API + "/publish", "-X", "POST", "-H", "Content-Type: application/json", "--data", json.dumps({"version": saved["draft_version"]})))
live = json.load(urllib.request.urlopen(f"{CDN}/miniatures/manifest.json?v={random.random()}"))["miniatures"]
paths = {m["path"] for m in live}
for p in plan:
    req = urllib.request.Request(f"{CDN}/{p['path']}", headers={"Origin": "https://octo.chronicleclassic.com"})
    n = len(urllib.request.urlopen(req).read())
    ok = p["path"] in paths and n == os.path.getsize(p["file"])
    print("OK " if ok else "BAD", p["name"], n)
