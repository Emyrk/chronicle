"""OpenRouter image generation + still verification.

The HTTP call is behind a `transport` so tests never touch the network
(`python3 -m unittest` must make no network call). The real transport is
`http_transport`, used only by the CLI's live path.
"""
from __future__ import annotations

import base64
import io
import json
import urllib.error
import urllib.request

from PIL import Image

API_URL = "https://openrouter.ai/api/v1/images"
REQUIRED_SIZE = (2048, 2048)
MAX_BYTES = 20 * 1024 * 1024
ANCHOR_PX = 1024


class RenderError(Exception):
    """A still failed to render or failed verification. Carries the view name."""

    def __init__(self, view, message):
        super().__init__(f"{view}: {message}")
        self.view = view


def http_transport(body, api_key, timeout=180):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:500]}") from e


def make_anchor_jpeg(png_path, max_px=ANCHOR_PX):
    """Downscale an approved still to a JPEG anchor for input_references."""
    with Image.open(png_path) as im:
        im = im.convert("RGB")
        im.thumbnail((max_px, max_px), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=90)
        return buf.getvalue()


def _data_uri(raw_bytes, mime):
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def verify_and_normalize_png(raw_bytes, view):
    """Real PNG bytes, 2048x2048, under 20MB — or raise RenderError(view, ...)."""
    try:
        im = Image.open(io.BytesIO(raw_bytes))
        im.load()
    except Exception as e:
        raise RenderError(view, f"not a decodable image: {e}") from e

    if im.format != "PNG":
        buf = io.BytesIO()
        im.convert("RGB").save(buf, format="PNG")
        raw_bytes = buf.getvalue()
        im = Image.open(io.BytesIO(raw_bytes))

    if im.size != REQUIRED_SIZE:
        raise RenderError(view, f"wrong resolution {im.size[0]}x{im.size[1]} (want 2048x2048)")
    if len(raw_bytes) >= MAX_BYTES:
        raise RenderError(view, f"{len(raw_bytes)} bytes, over the 20MB limit")
    return raw_bytes


def render_still(model, prompt, size, api_key, view, anchor_bytes=None, transport=None):
    """Render one still. Returns (png_bytes, cost). Raises RenderError on failure."""
    transport = transport or http_transport
    body = {"model": model, "prompt": prompt, "size": size}
    if anchor_bytes is not None:
        body["input_references"] = [
            {"type": "image_url", "image_url": {"url": _data_uri(anchor_bytes, "image/jpeg")}}
        ]
    try:
        resp = transport(body, api_key)
        img = resp["data"][0]
        raw = base64.b64decode(img["b64_json"])
        cost = float(resp.get("usage", {}).get("cost", 0.0))
    except RenderError:
        raise
    except Exception as e:
        raise RenderError(view, str(e)) from e

    png_bytes = verify_and_normalize_png(raw, view)
    return png_bytes, cost
