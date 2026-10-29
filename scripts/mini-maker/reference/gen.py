#!/usr/bin/env python3
"""OpenRouter image generation helper for the Taranis deck art task."""
import base64, json, os, sys, time, urllib.request, urllib.error

API = "https://openrouter.ai/api/v1/images"
KEY = os.environ["OPENROUTER_API_KEY"]
OUT = os.path.dirname(os.path.abspath(__file__))
COST_LOG = os.path.join(OUT, "cost.log")

def log_cost(model, tag, cost):
    with open(COST_LOG, "a") as f:
        f.write(f"{tag}\t{model}\t{cost}\n")

def total_cost():
    if not os.path.exists(COST_LOG):
        return 0.0
    t = 0.0
    for line in open(COST_LOG):
        parts = line.strip().split("\t")
        if len(parts) == 3:
            try: t += float(parts[2])
            except: pass
    return t

def gen(model, prompt, aspect_ratio, out_path, tag, input_refs=None, retries=3):
    """Generate one image. input_refs: list of local file paths to pass as references."""
    # aspect_ratio holds either a ratio string ("1:1") or an explicit pixel size
    # ("2304x1728"); seedream ignores aspect_ratio and honors size, so route by shape.
    if "x" in aspect_ratio:
        body = {"model": model, "prompt": prompt, "size": aspect_ratio}
    else:
        body = {"model": model, "prompt": prompt, "aspect_ratio": aspect_ratio}
    if input_refs:
        imgs = []
        for p in input_refs:
            with open(p, "rb") as f:
                b = base64.b64encode(f.read()).decode()
            ext = "png" if p.endswith(".png") else "jpeg"
            uri = f"data:image/{ext};base64,{b}"
            imgs.append({"type": "image_url", "image_url": {"url": uri}})
        body["input_references"] = imgs
    data = json.dumps(body).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(API, data=data, headers={
                "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read())
            img = d["data"][0]
            raw = base64.b64decode(img["b64_json"])
            with open(out_path, "wb") as f:
                f.write(raw)
            cost = d.get("usage", {}).get("cost", 0.0)
            log_cost(model, tag, cost)
            print(f"OK  {tag:28s} {model:32s} {len(raw):>8d}B  ${cost:.4f}  {img['media_type']}")
            return {"ok": True, "cost": cost, "path": out_path, "media": img["media_type"]}
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:300]
            print(f"ERR {tag} attempt {attempt+1}: HTTP {e.code} {err}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
        except Exception as e:
            print(f"ERR {tag} attempt {attempt+1}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    return {"ok": False, "tag": tag}

if __name__ == "__main__":
    spec = json.load(open(sys.argv[1]))
    results = []
    for job in spec:
        if os.path.exists(job["out"]) and not job.get("force"):
            print(f"SKIP {job['tag']} (exists)")
            continue
        r = gen(job["model"], job["prompt"], job["ar"], job["out"], job["tag"],
                input_refs=job.get("refs"))
        results.append(r)
    print(f"\n=== TOTAL SPEND: ${total_cost():.4f} ===")
