"""Machine settings for the render-map tools: local.yaml, the workdir and its safety check.

  .venv/bin/python -I tools/rmconfig.py          # print the resolved settings and where they came from

local.yaml is looked up in scripts/render-map/ first, then ~/.config/chronicle-render-map/ (that one
survives worktrees and fresh checkouts); the first file found is used whole. Copy local.example.yaml.
Every key is optional; a missing key falls back to the default below. LOCAL.md (the operator's rules)
follows the same lookup order; the tools do not read it, the skill does.

All state lives under `workdir`: maps/<slug>/{map.yaml,fetch.json,raw,renders,published}, cache/ and
data/wdt-index.csv. The tools refuse a workdir inside any git repository that has a remote: the files
there are Blizzard-derived and must never be one `git add -A` away from a public repo.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)  # scripts/render-map
USER_DIR = os.path.join(os.path.expanduser("~"), ".config", "chronicle-render-map")
SEARCH = [PKG, USER_DIR]

DEFAULTS = {
    "workdir": "~/.cache/chronicle-render-map",
    "blender": "/Applications/Blender.app/Contents/MacOS/Blender",  # pinned to 4.3 by render_set.py
    "python": None,  # interpreter for render_set's sub-steps; None = the one running the tool
    "mpq_clients": {},  # name -> 1.12 client directory (holds Data/); opened read-only
    "foundry": {"host": "telemetry.chronicleclassic.com", "namespace": None},
    "log_hosts": ["octo.chronicleclassic.com"],  # check_log_positions.py --host default = the first
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


def mpq_client(name_or_path, cfg=None):
    """A `client:` value (map.yaml or --client): a key of mpq_clients, else a path."""
    cfg = cfg or CFG
    clients = cfg.get("mpq_clients") or {}
    if str(name_or_path) in clients:
        return expand(clients[str(name_or_path)])
    p = expand(name_or_path)
    if not os.path.isdir(p):
        raise SystemExit("MPQ client %r is neither a key of mpq_clients in local.yaml (%s) nor a directory"
                         % (name_or_path, ", ".join(clients) or "none set"))
    return p


def version_dir(p):
    """A version folder given relative to the current directory, else relative to the workdir."""
    from pathlib import Path
    if os.path.isdir(p):
        return Path(p)
    w = Path(workdir(create=False)) / p
    if not w.is_dir():
        raise SystemExit("no version folder %s (nor %s)" % (p, w))
    return w


CFG = load()


if __name__ == "__main__":
    import json
    show = dict(CFG)
    print("local.yaml: %s" % (show.pop("_source") or "none (defaults; lookup: %s)" % ", ".join(SEARCH)))
    print("LOCAL.md:   %s" % (find("LOCAL.md") or "none"))
    print(json.dumps(show, indent=2))
    print("workdir ok: %s" % workdir(create=False), file=sys.stderr)
