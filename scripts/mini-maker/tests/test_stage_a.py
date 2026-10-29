import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib import gate, stage_a
from mini_lib.heroes import normalize
from mini_lib.imagegen import RenderError

HERO = normalize({
    "slug": "unit-hero",
    "name": "Unit Hero",
    "desc": "a plain figure",
    "palette": ["storm gray"],
    "views": ["front", "back"],
    "finish": "painted",
    "notes": "nothing special",
    "back": "From behind, nothing else is visible.",
})


def _fake_png_bytes():
    from PIL import Image
    import io
    im = Image.new("RGB", (2048, 2048), color=(200, 200, 200))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


class StageADirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cwd = os.getcwd()
        os.chdir(self.tmp)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)


class RenderHeroTests(StageADirTest):
    def test_success_writes_all_views_and_meta(self):
        calls = []

        def fake_render(model, prompt, size, api_key, view, anchor_bytes=None):
            calls.append({"view": view, "anchored": anchor_bytes is not None})
            return _fake_png_bytes(), 0.05

        meta = stage_a.render_hero(HERO, "fake-key", render_fn=fake_render, cost_log_path="cost.log")

        self.assertEqual(meta["stills_status"], gate.STILLS_PENDING)
        self.assertTrue(os.path.exists("work/unit-hero/front.png"))
        self.assertTrue(os.path.exists("work/unit-hero/back.png"))
        self.assertTrue(os.path.exists("work/unit-hero/prompt.txt"))
        self.assertTrue(os.path.exists("work/unit-hero/hero.yaml"))
        self.assertTrue(os.path.exists("work/unit-hero/meta.json"))

        # front rendered first, unanchored; back anchored to it
        self.assertEqual(calls[0]["view"], "front")
        self.assertFalse(calls[0]["anchored"])
        self.assertEqual(calls[1]["view"], "back")
        self.assertTrue(calls[1]["anchored"])

        with open("cost.log") as f:
            lines = f.read().strip().splitlines()
        self.assertEqual(len(lines), 2)

    def test_failed_view_keeps_earlier_work_and_raises(self):
        def fake_render(model, prompt, size, api_key, view, anchor_bytes=None):
            if view == "front":
                return _fake_png_bytes(), 0.05
            raise RenderError(view, "API said no")

        with self.assertRaises(RenderError) as ctx:
            stage_a.render_hero(HERO, "fake-key", render_fn=fake_render, cost_log_path="cost.log")
        self.assertEqual(ctx.exception.view, "back")
        self.assertTrue(os.path.exists("work/unit-hero/front.png"))
        self.assertFalse(os.path.exists("work/unit-hero/back.png"))
        # no gate state recorded for a run that never completed
        self.assertFalse(os.path.exists("work/unit-hero/meta.json"))

    def test_rerun_replaces_only_that_slug(self):
        os.makedirs("work/other-hero", exist_ok=True)
        with open("work/other-hero/front.png", "wb") as f:
            f.write(b"keepme")

        def fake_render(model, prompt, size, api_key, view, anchor_bytes=None):
            return _fake_png_bytes(), 0.05

        stage_a.render_hero(HERO, "fake-key", render_fn=fake_render, cost_log_path="cost.log")
        stage_a.render_hero(HERO, "fake-key", render_fn=fake_render, cost_log_path="cost.log")

        self.assertTrue(os.path.exists("work/unit-hero/front.png"))
        self.assertTrue(os.path.exists("work/other-hero/front.png"))
        with open("work/other-hero/front.png", "rb") as f:
            self.assertEqual(f.read(), b"keepme")


class VerifyStillTests(unittest.TestCase):
    def test_wrong_resolution_is_a_failed_view(self):
        from mini_lib.imagegen import verify_and_normalize_png
        from PIL import Image
        import io
        im = Image.new("RGB", (1024, 1024))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        with self.assertRaises(RenderError) as ctx:
            verify_and_normalize_png(buf.getvalue(), "front")
        self.assertEqual(ctx.exception.view, "front")

    def test_jpeg_bytes_are_converted_to_real_png(self):
        from mini_lib.imagegen import verify_and_normalize_png
        from PIL import Image
        import io
        im = Image.new("RGB", (2048, 2048))
        buf = io.BytesIO()
        im.save(buf, format="JPEG")
        png_bytes = verify_and_normalize_png(buf.getvalue(), "front")
        out = Image.open(io.BytesIO(png_bytes))
        self.assertEqual(out.format, "PNG")
        self.assertEqual(out.size, (2048, 2048))


if __name__ == "__main__":
    unittest.main()
