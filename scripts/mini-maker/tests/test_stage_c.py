import os
import shutil
import sys
import tempfile
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib import gate, meshy, stage_c

FAKE_GLB = b"glTF-fake-bytes"
FAKE_STL_HEADER = b"\0" * 80 + (12345).to_bytes(4, "little")


def _seed_stills_approved(slug, views=("front", "back")):
    out_dir = gate.out_dir(slug)
    os.makedirs(out_dir, exist_ok=True)
    for v in views:
        with open(os.path.join(out_dir, f"{v}.png"), "wb") as f:
            f.write(b"fake-png-bytes")
    meta = {
        "slug": slug,
        "views": list(views),
        "finish": "painted",
        "stills_status": gate.STILLS_APPROVED,
        "stills_approved_by": "manual",
        "mesh_status": None,
    }
    gate.save_meta(slug, meta)
    return meta


class DirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cwd = os.getcwd()
        os.chdir(self.tmp)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)


class GateTests(DirTest):
    def test_stage_c_refuses_a_slug_that_is_not_stills_approved(self):
        gate.save_meta("no-gate-hero", {"stills_status": gate.STILLS_PENDING, "views": ["front"]})
        with self.assertRaises(gate.GateError):
            stage_c.submit_hero("no-gate-hero", "fake-key")

    def test_stage_c_refuses_a_slug_with_no_meta_at_all(self):
        with self.assertRaises(gate.GateError):
            stage_c.submit_hero("never-rendered", "fake-key")


class SubmitHeroTests(DirTest):
    def test_success_downloads_mesh_and_opens_mesh_gate(self):
        _seed_stills_approved("king-taranis")

        def transport(method, path, api_key, body=None):
            if method == "POST":
                self.assertEqual(path, "/multi-image-to-3d")
                self.assertIn("image_urls", body)
                self.assertFalse(body["should_texture"])
                return {"result": "task-123"}
            return {
                "status": "SUCCEEDED",
                "model_urls": {"glb": "https://example/raw.glb", "stl": "https://example/raw.stl"},
                "consumed_credits": 12,
                "created_at": 1, "started_at": 2, "finished_at": 3,
            }

        def download(url):
            return FAKE_GLB if url.endswith(".glb") else FAKE_STL_HEADER

        meta = stage_c.submit_hero("king-taranis", "fake-key", transport=transport,
                                    download=download, poll_interval=0)

        self.assertEqual(meta["mesh_status"], gate.MESH_PENDING)
        self.assertEqual(meta["meshy"]["task_id"], "task-123")
        self.assertEqual(meta["meshy"]["credits_billed"], 12)
        self.assertTrue(os.path.exists("work/king-taranis/mesh/raw.glb"))
        self.assertTrue(os.path.exists("work/king-taranis/mesh/raw.stl"))
        with open("meshy-tests/LOG.md") as f:
            self.assertIn("task-123", f.read())

    def test_single_view_hero_uses_single_image_endpoint(self):
        _seed_stills_approved("front-only-hero", views=("front",))

        seen = {}

        def transport(method, path, api_key, body=None):
            if method == "POST":
                seen["path"] = path
                seen["body"] = body
                return {"result": "task-1"}
            return {"status": "SUCCEEDED", "model_urls": {}, "consumed_credits": 5}

        stage_c.submit_hero("front-only-hero", "fake-key", transport=transport,
                             download=lambda u: b"x", poll_interval=0)
        self.assertEqual(seen["path"], "/image-to-3d")
        self.assertIn("image_url", seen["body"])

    def test_failed_task_raises_and_names_task_id(self):
        _seed_stills_approved("king-taranis")

        def transport(method, path, api_key, body=None):
            if method == "POST":
                return {"result": "task-999"}
            return {"status": "FAILED", "task_error": {"message": "bad topology"}}

        with self.assertRaises(meshy.MeshyTaskError) as ctx:
            stage_c.submit_hero("king-taranis", "fake-key", transport=transport, poll_interval=0)
        self.assertEqual(ctx.exception.task_id, "task-999")
        self.assertIn("bad topology", str(ctx.exception))

        # the gate must not have advanced
        meta = gate.load_meta("king-taranis")
        self.assertIsNone(meta["mesh_status"])


class AutoLicenseTests(DirTest):
    def test_no_license_when_nothing_approved(self):
        self.assertFalse(gate.any_manual_mesh_approved())

    def test_no_license_from_an_auto_approval(self):
        gate.save_meta("h1", {"mesh_status": gate.MESH_APPROVED, "mesh_approved_by": "auto"}, gate.work_root("some-dungeon"))
        self.assertFalse(gate.any_manual_mesh_approved())

    def test_license_from_a_manual_approval(self):
        gate.save_meta("h1", {"mesh_status": gate.MESH_APPROVED, "mesh_approved_by": "manual"}, gate.work_root("some-dungeon"))
        self.assertTrue(gate.any_manual_mesh_approved())


if __name__ == "__main__":
    unittest.main()
