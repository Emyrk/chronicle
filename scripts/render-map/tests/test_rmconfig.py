import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import rmconfig  # noqa: E402


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def make_repo(path, remote=None, push_url=None):
    path.mkdir(parents=True, exist_ok=True)
    git(path, "init", "-q")
    if remote:
        git(path, "remote", "add", "origin", remote)
        if push_url:
            git(path, "remote", "set-url", "--push", "origin", push_url)
    return path


class WorkdirGuardTest(unittest.TestCase):
    def setUp(self):
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        self.root = Path(td.name).resolve()

    def check(self, workdir):
        cfg = {"workdir": str(workdir), "_source": None}
        return rmconfig.workdir(cfg, create=False)

    def test_non_pushable_remote_only_is_accepted(self):
        for name, remote, push in (
            ("disabled", "https://example.com/a/b", "DISABLED"),
            ("invalid", "https://t3-workspace.invalid/a/b", None),
            ("scp-invalid", "git@host.invalid:a/b.git", None),
        ):
            with self.subTest(name):
                repo = make_repo(self.root / name, remote, push)
                (repo / "rendered-maps").mkdir()
                self.assertEqual(self.check(repo / "rendered-maps"), str(repo / "rendered-maps"))

    def test_no_remote_is_accepted(self):
        repo = make_repo(self.root / "plain")
        self.assertEqual(self.check(repo / "w"), str(repo / "w"))

    def test_real_remote_is_refused(self):
        for name, remote, push in (
            ("https", "https://github.com/Emyrk/chronicle.git", None),
            ("scp", "git@github.com:Emyrk/chronicle.git", None),
            ("pushurl", "https://example.invalid/a", "git@github.com:a/b.git"),
        ):
            with self.subTest(name):
                repo = make_repo(self.root / name, remote, push)
                (repo / "w").mkdir()
                with self.assertRaises(SystemExit) as cm:
                    self.check(repo / "w")
                msg = str(cm.exception)
                self.assertIn("refusing workdir", msg)
                self.assertIn("which has a remote", msg)
                self.assertIn(str(repo), msg)

    def test_nested_real_remote_inside_non_pushable_outer_is_refused(self):
        outer = make_repo(self.root / "outer", "https://t3-workspace.invalid/a/b", "DISABLED")
        inner = make_repo(outer / "inner", "https://github.com/Emyrk/chronicle.git")
        (inner / "w").mkdir()
        with self.assertRaises(SystemExit) as cm:
            self.check(inner / "w")
        self.assertIn("inside git repo %s" % inner, str(cm.exception))
        self.assertEqual([d for d, _ in rmconfig.git_repos_with_remote(str(inner / "w"))], [str(inner)])


if __name__ == "__main__":
    unittest.main()
