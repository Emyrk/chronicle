"""Fetch the M2 doodads an already-fetched terrain map places (MDDF) into maps/<slug>/raw/m2/.
SPIKE companion to adt2obj --m2. Usage: m2fetch.py <slug>"""
import glob
import os
import struct
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rmconfig  # noqa: E402
ROOT = rmconfig.workdir()  # maps/, cache/, data/ (local.yaml `workdir`)
import m2obj  # noqa: E402


def main():
    slug = sys.argv[1]
    mdir = os.path.join(ROOT, "maps", slug)
    cfg = yaml.safe_load(open(os.path.join(mdir, "map.yaml")))
    raw = os.path.join(mdir, "raw")
    fids = set()
    for p in glob.glob(os.path.join(raw, "adt", "*_obj0.adt")):
        buf = open(p, "rb").read()
        for tag, off, size in m2obj.chunks(buf):
            if tag[::-1] == "MDDF":  # ADT chunk tags are stored reversed
                for i in range(size // 36):
                    fids.add(struct.unpack_from("<I", buf, off + 36 * i)[0])
    product, region = cfg["product"], cfg.get("region", "us")
    cache = os.path.join(ROOT, "cache", "cdn", "%s-%s" % (product, region))
    params = "%s*%s*%s" % (cache, product, region)
    bad = m2obj.fetch(raw, os.path.join(ROOT, "cache", "casc", "cascget"), params, sorted(fids))
    print("m2fetch: %d models, %d unusable: %s" % (len(fids), len(bad), bad))


if __name__ == "__main__":
    main()
