import base64
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib import gate, portraits, publish
from mini_lib.heroes import normalize

import migrate_wc_work

D = "test-dungeon"
ROOT = os.path.join("work", D)


def _png(color):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color=color).save(buf, format="PNG")
    return buf.getvalue()


class DirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cwd = os.getcwd()
        os.chdir(self.tmp)

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _seed(self, slug, *, mesh_status=gate.MESH_APPROVED, stage_d=True):
        work = gate.out_dir(slug, ROOT)
        os.makedirs(os.path.join(work, "mesh"))
        for name in publish.MESH_FILES + ("raw.stl", "play-15k.glb"):
            with open(os.path.join(work, "mesh", name), "wb") as f:
                f.write(f"{slug}:{name}".encode() * 7)
        for view, color in (("front", (200, 0, 0)), ("back", (0, 0, 200))):
            with open(os.path.join(work, f"{view}.png"), "wb") as f:
                f.write(_png(color))
        with open(os.path.join(work, "hero.yaml"), "w") as f:
            f.write(f"slug: {slug}\n")
        meta = {"slug": slug, "views": ["front", "back"], "mesh_status": mesh_status}
        if stage_d:
            meta["stage_d"] = {"play": {}}
        gate.save_meta(slug, meta, ROOT)
        return work


class PublishTests(DirTest):
    def test_copies_the_dungeon_layout_byte_for_byte(self):
        work = self._seed("boss-a")
        dest = publish.publish_boss(D, "boss-a")
        self.assertEqual(dest, os.path.join("dungeons", D, "boss-a"))
        for name in publish.MESH_FILES:
            with open(os.path.join(work, "mesh", name), "rb") as a, open(os.path.join(dest, name), "rb") as b:
                self.assertEqual(a.read(), b.read())
        for view in ("front", "back"):
            with open(os.path.join(work, f"{view}.png"), "rb") as a, \
                    open(os.path.join(dest, "stills", f"{view}.png"), "rb") as b:
                self.assertEqual(a.read(), b.read())
        self.assertEqual(sorted(os.listdir(dest)),
                         ["hero.yaml", "play.glb", "print.stl", "raw.glb", "stills", "web.glb"])

    def test_leaves_other_files_in_the_boss_folder_alone(self):
        self._seed("boss-a")
        extra = os.path.join("dungeons", D, "boss-a", "textured")
        os.makedirs(extra)
        with open(os.path.join(extra, "task.json"), "w") as f:
            f.write("{}")
        publish.publish_boss(D, "boss-a")
        self.assertTrue(os.path.exists(os.path.join(extra, "task.json")))

    def test_refuses_unless_mesh_approved_and_compressed(self):
        self._seed("pending", mesh_status=gate.MESH_PENDING)
        self._seed("raw-only", stage_d=False)
        for slug, needle in (("pending", "mesh_approved"), ("raw-only", "stage_d"), ("missing", "meta.json")):
            with self.subTest(slug=slug):
                with self.assertRaises(publish.PublishError) as ctx:
                    publish.publish_boss(D, slug)
                self.assertIn(needle, str(ctx.exception))
                self.assertFalse(os.path.exists(os.path.join("dungeons", D, slug)))

    def test_refuses_when_a_mesh_file_is_missing(self):
        work = self._seed("boss-a")
        os.remove(os.path.join(work, "mesh", "play.glb"))
        with self.assertRaises(publish.PublishError) as ctx:
            publish.publish_boss(D, "boss-a")
        self.assertIn("play.glb", str(ctx.exception))

    def test_contact_sheet_one_column_per_published_boss(self):
        from PIL import Image
        for slug in ("boss-b", "boss-a"):
            self._seed(slug)
            publish.publish_boss(D, slug)
        os.makedirs(os.path.join("dungeons", D, "portraits"))  # not a boss: ignored
        path = publish.refresh_contact_sheet(D)
        self.assertEqual(path, os.path.join("dungeons", D, "stills-contact.jpg"))
        with Image.open(path) as im:
            self.assertEqual(im.size, (2 * publish.CONTACT_CELL, 2 * publish.CONTACT_CELL))
            top = im.getpixel((publish.CONTACT_CELL // 2, publish.CONTACT_CELL // 2))
            bottom = im.getpixel((publish.CONTACT_CELL // 2, publish.CONTACT_CELL * 3 // 2))
        self.assertGreater(top[0], 150)      # front (red) on top
        self.assertGreater(bottom[2], 150)   # back (blue) below

    def test_contact_sheet_none_when_nothing_published(self):
        os.makedirs(os.path.join("dungeons", D))
        self.assertIsNone(publish.refresh_contact_sheet(D))


BOSS = normalize({
    "slug": "boss-a", "name": "Boss A", "desc": "a plain figure", "palette": ["gray"],
    "views": ["front"], "finish": "painted", "notes": "thick", "portrait": "a plain figure, dim hall",
})


class PortraitTests(DirTest):
    def test_prompt_is_portrait_then_style(self):
        jobs = portraits.plan(D, {"portrait_style": "oil painting"}, [BOSS])
        self.assertEqual(jobs[0]["prompt"], "a plain figure, dim hall. oil painting")
        self.assertEqual(jobs[0]["out"], os.path.join("dungeons", D, "portraits", "boss-a.jpg"))
        self.assertFalse(jobs[0]["skip"])

    def test_missing_style_or_portrait_refused(self):
        with self.assertRaises(portraits.PortraitError):
            portraits.plan(D, {"portrait_style": None}, [BOSS])
        with self.assertRaises(portraits.PortraitError):
            portraits.plan(D, {"portrait_style": "x"}, [{**BOSS, "portrait": None}])

    def test_existing_skipped_unless_forced(self):
        os.makedirs(os.path.join("dungeons", D, "portraits"))
        open(os.path.join("dungeons", D, "portraits", "boss-a.jpg"), "wb").close()
        self.assertTrue(portraits.plan(D, {"portrait_style": "x"}, [BOSS])[0]["skip"])
        self.assertFalse(portraits.plan(D, {"portrait_style": "x"}, [BOSS], force={"boss-a"})[0]["skip"])

    def test_render_writes_jpg_and_logs_cost(self):
        sent = {}

        def transport(body, api_key):
            sent.update(body)
            return {"data": [{"b64_json": base64.b64encode(b"JPEG").decode()}], "usage": {"cost": 0.04}}

        job = portraits.plan(D, {"portrait_style": "oil painting"}, [BOSS])[0]
        cost = portraits.render(job, "fake", D, transport=transport, cost_log_path="cost.log")
        self.assertEqual(cost, 0.04)
        self.assertEqual(sent, {"model": portraits.MODEL, "prompt": job["prompt"], "size": portraits.SIZE})
        with open(job["out"], "rb") as f:
            self.assertEqual(f.read(), b"JPEG")
        with open("cost.log") as f:
            self.assertEqual(f.read(), f"{D}/boss-a-portrait\t{portraits.MODEL}\t0.04\n")


class MigrateWcWorkTests(DirTest):
    def test_dry_run_touches_nothing_then_apply_moves_and_rewrites(self):
        os.makedirs("work/wc-kresh/mesh")
        with open("work/wc-kresh/meta.json", "w") as f:
            json.dump({"slug": "wc-kresh", "meshy": {"downloaded": {
                "glb": {"path": "out/wc-kresh/mesh/raw.glb", "bytes": 1}}}}, f)
        with open("work/wc-kresh/hero.yaml", "w") as f:
            f.write("slug: wc-kresh\nname: Kresh\naliases: []\nlegacy_flag: false\n")
        with open("work/wc-contact.jpg", "wb") as f:
            f.write(b"jpg")

        self.assertEqual(migrate_wc_work.main(["--root", "."]), 0)
        self.assertTrue(os.path.isdir("work/wc-kresh"))

        self.assertEqual(migrate_wc_work.main(["--root", ".", "--apply"]), 0)
        self.assertFalse(os.path.exists("work/wc-kresh"))
        with open("work/wailing-caverns/kresh/meta.json") as f:
            meta = json.load(f)
        self.assertEqual(meta["slug"], "kresh")
        self.assertEqual(meta["meshy"]["downloaded"]["glb"]["path"], "work/wailing-caverns/kresh/mesh/raw.glb")
        with open("work/wailing-caverns/kresh/hero.yaml") as f:
            self.assertEqual(f.read(), "slug: kresh\nname: Kresh\n")
        self.assertTrue(os.path.exists("work/wailing-caverns/stills-contact.jpg"))

        self.assertEqual(migrate_wc_work.main(["--root", "."]), 0)  # idempotent: nothing left


if __name__ == "__main__":
    unittest.main()
