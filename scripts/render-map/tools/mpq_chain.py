"""Read a 1.12 (MPQ) client's Data/ as the client sees it: the archive chain, resolved by name.

  python3 -I mpq_chain.py --client <mpq_clients name or path> list 'world\\wmo\\dungeon\\kl_onyxiaslair\\*'
  python3 -I mpq_chain.py --client <mpq_clients name or path> get '<name>' <outfile>

Load order (lowest priority first) is the one WoW.exe 1.12 encodes: the base archives
(`strings WoW.exe`: dbc, fonts, interface, misc, sound, speech, wmo, terrain, texture, model,
plus base/backup), then `patch.MPQ`, then the `patch-?.MPQ` wildcard in name order
(patch-2 .. patch-9, patch-A, ...). A later archive wins. Locale `patch-L.mpq` files in
Data/<locale>/ are listed separately (`--locale`) and are not part of the world chain.

Every archive is opened read-only (STREAM_FLAG_READ_ONLY): nothing is ever written into a
client directory. Names come from each archive's own (listfile); `list` reports unnamed
entries (none in OctoWoW).

StormLib (same author as CascLib) is built once into cache/mpq/, pinned by tools/mpq/STORMLIB_COMMIT.
"""
import argparse
import fnmatch
import glob
import hashlib
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rmconfig  # noqa: E402
ROOT = rmconfig.workdir()  # maps/, cache/, data/ (local.yaml `workdir`)
MPQ_DIR = os.path.join(ROOT, "cache", "mpq")
MPQGET = os.path.join(MPQ_DIR, "mpqget")
STORMLIB_REPO = "https://github.com/ladislav-zezula/StormLib.git"
STORMLIB_COMMIT = open(os.path.join(HERE, "mpq", "STORMLIB_COMMIT")).read().strip()

BASE = ["base.MPQ", "backup.MPQ", "dbc.MPQ", "fonts.MPQ", "interface.MPQ", "misc.MPQ", "sound.MPQ",
        "speech.MPQ", "speech2.MPQ", "wmo.MPQ", "terrain.MPQ", "texture.MPQ", "model.MPQ"]


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def sh(cmd, **kw):
    print("[mpq] $ " + " ".join(cmd), file=sys.stderr)
    return subprocess.run(cmd, check=True, **kw)


def ensure_mpqget():
    src_cpp = os.path.join(HERE, "mpq", "mpqget.cpp")
    stamp = MPQGET + ".src.sha256"
    if os.path.exists(MPQGET) and os.path.exists(stamp) and open(stamp).read().strip() == sha(src_cpp):
        return
    os.makedirs(MPQ_DIR, exist_ok=True)
    src = os.path.join(MPQ_DIR, "StormLib")
    if not os.path.exists(src):
        sh(["git", "clone", "-q", STORMLIB_REPO, src])
    sh(["git", "-C", src, "checkout", "-q", STORMLIB_COMMIT])
    build = os.path.join(MPQ_DIR, "build")
    os.makedirs(build, exist_ok=True)
    if not os.path.exists(os.path.join(build, "libstorm.a")):
        # bundled libtommath/libtomcrypt: homebrew has no libtommath pkg-config
        sh(["cmake", "-DCMAKE_POLICY_VERSION_MINIMUM=3.5", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF",
            "-DSTORM_USE_BUNDLED_LIBRARIES=ON", "-DSTORM_BUILD_TESTS=OFF", src], cwd=build, stdout=subprocess.DEVNULL)
        sh(["make", "-j8"], cwd=build, stdout=subprocess.DEVNULL)
    sh(["clang++", "-std=c++11", "-O2", "-I", os.path.join(src, "src"), src_cpp,
        os.path.join(build, "libstorm.a"), "-lz", "-lbz2", "-o", MPQGET])
    open(stamp, "w").write(sha(src_cpp))


class Chain:
    """The archives of one client's Data/, in load order, with every file resolved to its winner."""

    def __init__(self, client):
        ensure_mpqget()
        self.data = os.path.join(rmconfig.mpq_client(client), "Data")
        present = {os.path.basename(p).lower(): p for p in glob.glob(os.path.join(self.data, "*.[mM][pP][qQ]"))}
        base = [present.pop(b.lower()) for b in BASE if b.lower() in present]
        patch = [present.pop("patch.mpq")] if "patch.mpq" in present else []
        lettered = sorted((k for k in present if fnmatch.fnmatch(k, "patch-?.mpq")), key=lambda k: k.upper())
        patch += [present.pop(k) for k in lettered]
        self.unloaded = sorted(present.values())  # an .MPQ the client does not load (reported, not read)
        self.archives = base + patch
        self.files = {}      # lower name -> [(archive basename, size, name as stored)]
        self.unnamed = {}
        for a in self.archives:
            r = subprocess.run([MPQGET, "list", a], capture_output=True, text=True, errors="replace")
            if r.returncode:
                raise SystemExit("mpqget list %s failed: %s" % (a, r.stderr))
            self.unnamed[os.path.basename(a)] = int(r.stderr.rsplit("unnamed=", 1)[1].split()[0])
            for line in r.stdout.splitlines():
                n, s, _, _ = line.split("\t")
                self.files.setdefault(n.lower(), []).append((os.path.basename(a), int(s), n))

    def winner(self, name):
        hits = self.files.get(name.lower().replace("/", "\\"))
        return hits[-1] if hits else None

    def path_of(self, archive):
        return os.path.join(self.data, archive)

    def get(self, name, out):
        w = self.winner(name)
        if not w:
            raise KeyError(name)
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        subprocess.run([MPQGET, "get", self.path_of(w[0]), "%s=%s" % (w[2], out)], check=True)
        return w

    def glob(self, pattern):
        p = pattern.lower().replace("/", "\\")
        return sorted(k for k in self.files if fnmatch.fnmatchcase(k, p))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("archives")
    l = sub.add_parser("list"); l.add_argument("pattern")
    g = sub.add_parser("get"); g.add_argument("name"); g.add_argument("out")
    a = ap.parse_args()
    c = Chain(a.client)
    if a.cmd == "archives":
        for i, p in enumerate(c.archives):
            print("%2d %-16s unnamed=%d" % (i, os.path.basename(p), c.unnamed[os.path.basename(p)]))
        for p in c.unloaded:
            print(" - %-16s NOT LOADED" % os.path.basename(p))
    elif a.cmd == "list":
        for k in c.glob(a.pattern):
            hits = c.files[k]
            print("%s\t%s\t%d\t%s" % (hits[-1][2], hits[-1][0], hits[-1][1], ",".join(h[0] for h in hits)))
    else:
        print(c.get(a.name, a.out))


if __name__ == "__main__":
    main()
