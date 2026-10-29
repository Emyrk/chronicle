"""Meshy image-to-3d / multi-image-to-3d client.

Settings match MESHY.md's settings table exactly. The HTTP calls are behind
a `transport` so tests never touch the network; the real transport is
`http_transport`, used only by the CLI's live path.
"""
from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.request

BASE = "https://api.meshy.ai/openapi/v1"

# MESHY.md "Settings to test with" — Stage C.1 of mini-001.
PRODUCTION_SETTINGS = {
    "ai_model": "latest",
    "should_texture": False,
    "pose_mode": "",
    "image_enhancement": True,
    "should_remesh": False,
    "topology": "triangle",
    "geometry_resolution": "standard",
    "target_formats": ["glb", "stl"],
}

TERMINAL_FAILURE = ("FAILED", "CANCELED")


class MeshyTaskError(Exception):
    """A Meshy task failed, errored, or was canceled. Carries the task id."""

    def __init__(self, task_id, message):
        super().__init__(f"Meshy task {task_id} did not succeed: {message}")
        self.task_id = task_id


def http_transport(method, path, api_key, body=None, timeout=60):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
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


def download_transport(url, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def _data_uri(raw_bytes, mime="image/png"):
    return f"data:{mime};base64,{base64.b64encode(raw_bytes).decode('ascii')}"


def endpoint_for(image_paths):
    """front alone -> image-to-3d; front+back -> multi-image-to-3d (MESHY.md)."""
    return "/image-to-3d" if len(image_paths) == 1 else "/multi-image-to-3d"


def build_body(image_bytes_list, overrides=None):
    body = dict(PRODUCTION_SETTINGS)
    if overrides:
        body.update(overrides)
    if len(image_bytes_list) == 1:
        body["image_url"] = _data_uri(image_bytes_list[0])
    else:
        body["image_urls"] = [_data_uri(b) for b in image_bytes_list]
    return body


def create_task(image_bytes_list, api_key, overrides=None, transport=None):
    transport = transport or http_transport
    path = endpoint_for(image_bytes_list)
    body = build_body(image_bytes_list, overrides=overrides)
    resp = transport("POST", path, api_key, body=body)
    task_id = resp.get("result")
    if not task_id:
        raise RuntimeError(f"Meshy create task returned no id: {resp}")
    return path, task_id, body


def poll_task(path, task_id, api_key, transport=None, interval=5, timeout=900, sleep=time.sleep):
    transport = transport or http_transport
    deadline = time.monotonic() + timeout
    while True:
        resp = transport("GET", f"{path}/{task_id}", api_key)
        status = resp.get("status")
        if status == "SUCCEEDED":
            return resp
        if status in TERMINAL_FAILURE:
            err = (resp.get("task_error") or {}).get("message") or status
            raise MeshyTaskError(task_id, err)
        if time.monotonic() >= deadline:
            raise MeshyTaskError(task_id, f"polling timed out after {timeout}s (last status {status})")
        sleep(interval)
