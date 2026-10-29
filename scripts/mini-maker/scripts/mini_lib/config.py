"""Machine settings for mini-maker: local.yaml, the workdir and its safety check.

  python3 scripts/mini_lib/config.py          # print the resolved settings and where they came from
  python3 scripts/mini_lib/config.py --python # print the interpreter to run the tools with
  python3 scripts/mini_lib/config.py --workdir # print the checked workdir (created if missing)

local.yaml is looked up in scripts/mini-maker/ first, then ~/.config/chronicle-mini-maker/ (that one
survives worktrees and fresh checkouts); the first file found is used whole. Copy local.example.yaml.
Every key is optional; a missing key falls back to the default below. LOCAL.md (the operator's rules)
follows the same lookup order; the tools do not read it, the skill does.

All state lives under `workdir` (work/, published per-boss folders, portraits, meshy-tests/, cost.log).
The tools refuse a workdir inside any git repository that has a remote: the files there are
Blizzard-derived and must never be one `git add -A` away from a public repo. Rosters are the only
dungeon data tracked in the repo (scripts/mini-maker/dungeons/<slug>/roster.yaml).
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(os.path.dirname(HERE))  # scripts/mini-maker
USER_DIR = os.path.join(os.path.expanduser("~"), ".config", "chronicle-mini-maker")
SEARCH = [PKG, USER_DIR]
KEYS = ("MESHY_API_KEY", "OPENROUTER_API_KEY")

DEFAULTS = {
    "workdir": "~/.cache/chronicle-mini-maker",
    "python": None,  # interpreter the skill runs the tools with; None = the one running the tool
    "env_file": None,  # KEY=VALUE file holding MESHY_API_KEY / OPENROUTER_API_KEY; env vars win
    "foundry": {
        "api": "https://telemetry.chronicleclassic.com/internal/api/v1/miniatures",
        "cdn": "https://icons.chronicleclassic.com",
    },
}


def find(name):
    """First existing <dir>/<name> in the lookup order, or None."""
    for d in SEARCH:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def load():
    path = find("local.yaml")
    cfg = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULTS.items()}
    if path:
        import yaml
        local = yaml.safe_load(open(path)) or {}
        for k, v in local.items():
            if isinstance(cfg.get(k), dict) and isinstance(v, dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    cfg["_source"] = path
    return cfg


def expand(p):
    return os.path.abspath(os.path.expanduser(str(p)))


def git_repos_with_remote(path):
    """Every enclosing git repository of `path` (nested ones included) that has a remote."""
    hits = []
    d = path
    while True:
        if os.path.exists(os.path.join(d, ".git")):
            r = subprocess.run(["git", "-C", d, "remote", "-v"], capture_output=True, text=True)
            if r.returncode != 0 or r.stdout.strip():
                hits.append((d, r.stdout.strip() or r.stderr.strip()))
        parent = os.path.dirname(d)
        if parent == d:
            return hits
        d = parent


def workdir(cfg=None, create=True):
    cfg = cfg or CFG
    wd = expand(cfg["workdir"])
    probe = wd
    while not os.path.exists(probe):
        probe = os.path.dirname(probe)
    bad = git_repos_with_remote(probe)
    if bad:
        raise SystemExit("refusing workdir %s: it is inside git repo %s, which has a remote:\n%s\n"
                         "Blizzard-derived files must not be committable. Set `workdir` in local.yaml (%s) "
                         "to a directory outside every repo with a remote."
                         % (wd, bad[0][0], bad[0][1], cfg["_source"] or "none found; see local.example.yaml"))
    if create:
        os.makedirs(wd, exist_ok=True)
    return wd


def load_env_file(cfg=None):
    """Export MESHY_API_KEY / OPENROUTER_API_KEY from `env_file` unless already set. Never prints a value."""
    cfg = cfg or CFG
    if not cfg.get("env_file"):
        return
    path = expand(cfg["env_file"])
    if not os.path.isfile(path):
        raise SystemExit("env_file %s (local.yaml) does not exist" % path)
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        name, sep, value = line.partition("=")
        name = name.strip()
        if sep and name in KEYS and not os.environ.get(name):
            os.environ[name] = value.strip().strip("'\"")


def enter(cfg=None):
    """Prepare a real run: load the env file, point the roster lookup at the checkout's
    dungeons/, and chdir into the workdir (every other path in the pipeline is relative to it)."""
    from . import heroes
    cfg = cfg or CFG
    load_env_file(cfg)
    heroes.ROSTERS_ROOT = os.path.join(PKG, "dungeons")
    os.chdir(workdir(cfg))


CFG = load()


if __name__ == "__main__":
    if "--python" in sys.argv:
        print(expand(CFG["python"]) if CFG["python"] else sys.executable)
        raise SystemExit(0)
    if "--workdir" in sys.argv:
        print(workdir())
        raise SystemExit(0)
    import json
    show = dict(CFG)
    print("local.yaml: %s" % (show.pop("_source") or "none (defaults; lookup: %s)" % ", ".join(SEARCH)))
    print("LOCAL.md:   %s" % (find("LOCAL.md") or "none"))
    print(json.dumps(show, indent=2))
    print("workdir ok: %s" % workdir(create=False), file=sys.stderr)
