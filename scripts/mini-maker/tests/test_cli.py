import contextlib
import io
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

import mini
from mini_lib import gate

WC = "wailing-caverns"
WC_ROOT = os.path.join("work", WC)


class DirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cwd = os.getcwd()
        os.chdir(self.tmp)
        os.makedirs(os.path.join("dungeons", WC))
        shutil.copy(os.path.join(_ROOT, "dungeons", WC, "roster.yaml"),
                    os.path.join("dungeons", WC, "roster.yaml"))

    def tearDown(self):
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)


class DryRunTests(DirTest):
    def test_dry_run_plans_every_boss_writes_nothing_and_calls_no_api(self):
        no_network = mock.patch(
            "urllib.request.urlopen", side_effect=AssertionError("dry-run must not touch the network")
        )
        with no_network:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = mini.main(["render", "--dungeon", WC, "--dry-run"])
        self.assertEqual(rc, 0)
        self.assertFalse(os.path.exists("work"))
        text = out.getvalue()
        self.assertNotIn(os.environ.get("OPENROUTER_API_KEY", "\0impossible\0"), text)
        self.assertIn("9 boss(es)", text)
        self.assertIn("working dir: work/wailing-caverns/kresh/", text)
        self.assertNotIn("wc-", text)
        self.assertIn("--- front ", text)
        self.assertIn("--- back [anchored", text)

    def test_dry_run_requires_no_env_vars(self):
        env = {k: v for k, v in os.environ.items() if k not in ("OPENROUTER_API_KEY", "MESHY_API_KEY")}
        with mock.patch.dict(os.environ, env, clear=True):
            rc = mini.main(["render", "--dungeon", WC, "--only", "kresh", "--dry-run"])
        self.assertEqual(rc, 0)

    def test_unknown_dungeon_is_an_error(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc = mini.main(["render", "--dungeon", "no-such-dungeon", "--dry-run"])
        self.assertNotEqual(rc, 0)
        self.assertIn("new-dungeon", err.getvalue())


class RenderFailureExitCodeTests(DirTest):
    def test_failed_view_is_nonzero_and_names_the_view(self):
        def fake_render_hero(hero, api_key, model=None, size=None, root=None):
            from mini_lib.imagegen import RenderError
            raise RenderError("back", "simulated failure")

        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "fake"}):
            with mock.patch("mini.stage_a.render_hero", side_effect=fake_render_hero):
                err = io.StringIO()
                with contextlib.redirect_stderr(err):
                    rc = mini.main(["render", "--dungeon", WC, "--only", "kresh"])
        self.assertNotEqual(rc, 0)
        self.assertIn("back", err.getvalue())
        self.assertIn("work/wailing-caverns/kresh/", err.getvalue())


class ApproveGateTests(DirTest):
    def test_approve_stills_then_mesh_gate_blocks_until_ready(self):
        gate.save_meta("kresh", {
            "slug": "kresh", "views": ["front", "back"],
            "stills_status": gate.STILLS_PENDING, "stills_approved_by": None,
            "mesh_status": None,
        }, WC_ROOT)

        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc = mini.main(["mesh", "--dungeon", WC, "--only", "kresh", "--dry-run"])
        self.assertNotEqual(rc, 0)
        self.assertIn("stills_approved", err.getvalue())
        self.assertIn("--dungeon wailing-caverns", err.getvalue())

        rc = mini.main(["approve", "--dungeon", WC, "--only", "kresh", "--stage", "stills"])
        self.assertEqual(rc, 0)
        meta = gate.load_meta("kresh", WC_ROOT)
        self.assertEqual(meta["stills_status"], gate.STILLS_APPROVED)
        self.assertEqual(meta["stills_approved_by"], "manual")

        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = mini.main(["mesh", "--dungeon", WC, "--only", "kresh", "--dry-run"])
        self.assertEqual(rc, 0)
        self.assertIn("multi-image-to-3d", out.getvalue())

    def test_approve_unknown_boss_rejected(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc = mini.main(["approve", "--dungeon", WC, "--only", "no-such-boss", "--stage", "stills"])
        self.assertNotEqual(rc, 0)
        self.assertIn("unknown slug", err.getvalue())


class PublishCliTests(DirTest):
    def test_publish_refuses_unknown_slug(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc = mini.main(["publish", "--dungeon", WC, "--only", "no-such-boss"])
        self.assertNotEqual(rc, 0)
        self.assertIn("unknown slug", err.getvalue())

    def test_publish_refuses_an_uncompressed_boss(self):
        gate.save_meta("verdan-the-everliving", {
            "slug": "verdan-the-everliving", "mesh_status": gate.MESH_APPROVED, "views": ["front"],
        }, WC_ROOT)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc = mini.main(["publish", "--dungeon", WC, "--only", "verdan-the-everliving"])
        self.assertNotEqual(rc, 0)
        self.assertIn("stage_d", err.getvalue())
        self.assertFalse(os.path.exists(os.path.join("dungeons", WC, "verdan-the-everliving")))


class ImportMeshCliTests(DirTest):
    def test_import_mesh_opens_mesh_pending_in_the_dungeon_root(self):
        os.makedirs("source")
        with open("source/raw.glb", "wb") as f:
            f.write(b"placeholder")

        with mock.patch("mini.import_mesh_lib.import_mesh") as fake_import:
            fake_import.return_value = {"mesh_status": gate.MESH_PENDING}
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = mini.main(["import-mesh", "--dungeon", WC, "--only", "skum", "--glb", "source/raw.glb"])
        self.assertEqual(rc, 0)
        self.assertIn("mesh_pending", out.getvalue())
        fake_import.assert_called_once_with("skum", "source/raw.glb", root=WC_ROOT, stills_from=None)


class PortraitsCliTests(DirTest):
    def test_dry_run_reads_prompts_from_the_roster(self):
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("no network")):
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = mini.main(["portraits", "--dungeon", WC, "--only", "kresh", "--dry-run"])
        self.assertEqual(rc, 0)
        text = out.getvalue()
        self.assertIn("dungeons/wailing-caverns/portraits/kresh.jpg", text)
        self.assertIn("a colossal ancient cave turtle", text)
        self.assertIn("damp cavern atmosphere", text)
        self.assertFalse(os.path.exists(os.path.join("dungeons", WC, "portraits")))

    def test_existing_portrait_is_skipped_without_a_key(self):
        os.makedirs(os.path.join("dungeons", WC, "portraits"))
        with open(os.path.join("dungeons", WC, "portraits", "kresh.jpg"), "wb") as f:
            f.write(b"jpg")
        env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
        with mock.patch.dict(os.environ, env, clear=True):
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = mini.main(["portraits", "--dungeon", WC, "--only", "kresh"])
        self.assertEqual(rc, 0)
        self.assertIn("SKIP kresh", out.getvalue())


class NewDungeonCliTests(DirTest):
    def test_scaffolds_a_loadable_roster_and_refuses_to_overwrite(self):
        rc = mini.main(["new-dungeon", "shadowfang-keep"])
        self.assertEqual(rc, 0)
        from mini_lib.heroes import load_roster
        roster = load_roster(os.path.join("dungeons", "shadowfang-keep", "roster.yaml"))
        self.assertEqual(roster["name"], "Shadowfang Keep")
        self.assertEqual(roster["bosses"], [])
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc = mini.main(["new-dungeon", "shadowfang-keep"])
        self.assertNotEqual(rc, 0)
        self.assertIn("already exists", err.getvalue())

    def test_bad_slug_rejected(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc = mini.main(["new-dungeon", "Shadowfang_Keep"])
        self.assertNotEqual(rc, 0)


class AutoRefusalTests(DirTest):
    def test_auto_refuses_with_no_prior_manual_mesh_approval(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "fake", "MESHY_API_KEY": "fake"}):
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                rc = mini.main(["render", "--dungeon", WC, "--auto"])
        self.assertNotEqual(rc, 0)
        self.assertIn("mesh_approved", err.getvalue())
        self.assertFalse(os.path.exists("work"))

    def test_auto_unlocked_by_a_manual_approval_in_another_dungeon(self):
        gate.save_meta("some-boss", {
            "slug": "some-boss", "mesh_status": gate.MESH_APPROVED, "mesh_approved_by": "manual",
        }, os.path.join("work", "other-dungeon"))
        gate.save_meta("kresh", {
            "slug": "kresh", "mesh_status": gate.MESH_APPROVED, "mesh_approved_by": "auto",
            "stills_status": gate.STILLS_APPROVED, "views": ["front", "back"],
        }, WC_ROOT)
        # stage_d needs real files to compress; stub it out for this CLI-level test
        with mock.patch("mini.stage_d.compress_hero", return_value={}) as compress:
            with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "fake", "MESHY_API_KEY": "fake"}):
                rc = mini.main(["render", "--dungeon", WC, "--only", "kresh", "--auto"])
        self.assertEqual(rc, 0)
        compress.assert_called_once_with("kresh", root=WC_ROOT)


if __name__ == "__main__":
    unittest.main()
