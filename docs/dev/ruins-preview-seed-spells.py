#!/usr/bin/env python3
"""Seed chronicle_ruins.dbc_spells for the Ruins preview (docs/dev/ruins-preview-runbook.md).

Dev-only stand-in for a WoW Forever game-data import: collects the spell ids a
combat log uses, fetches each from prod's /api/v1/wowdb/spell/<id>, and writes
the rows the parser needs (name, icon id, school, spell_class_set) into the
local `forever` dataset.

Usage: python3 ruins-preview-seed-spells.py <combat log> | docker exec -i chronicle-postgres \
         psql -U postgres -d chronicle_ruins
"""
import concurrent.futures as cf
import json
import re
import sys
import urllib.request

DATASET = "(SELECT id FROM datasets WHERE slug='forever')"
HEADERS = {
    "Origin": "https://forever.chronicleclassic.com",
    "Sec-Fetch-Site": "same-origin",
    "Referer": "https://forever.chronicleclassic.com/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36",
}


def spell_ids(path):
    ids = set()
    with open(path, errors="replace") as f:
        for line in f:
            parts = line.split(",", 10)
            if len(parts) > 9 and re.search(r"(SPELL_|_DAMAGE|_HEAL|AURA)", parts[0]) and parts[9].isdigit():
                ids.add(int(parts[9]))
    return sorted(ids)


def fetch(spell_id):
    req = urllib.request.Request(
        f"https://forever.chronicleclassic.com/api/v1/wowdb/spell/{spell_id}", headers=HEADERS)
    try:
        return spell_id, json.load(urllib.request.urlopen(req, timeout=20))
    except Exception as err:
        print(f"-- skipped {spell_id}: {err}", file=sys.stderr)
        return spell_id, None


def lit(s):
    return "'" + s.replace("'", "''") + "'"


ids = spell_ids(sys.argv[1])
with cf.ThreadPoolExecutor(6) as pool:
    spells = [(i, d) for i, d in pool.map(fetch, ids) if d]
print(f"-- {len(spells)} of {len(ids)} spells", file=sys.stderr)
rows = ",\n".join(
    f"({DATASET},{i},{lit(d['name'].get('0', ''))},{lit(d['subtext'].get('0', ''))},"
    f"{int(d['spell_icon']['ID'])},{int(d['school']['value'])},{int(d['spell_class_set']['value'])})"
    for i, d in spells)
print("INSERT INTO dbc_spells(dataset_id,spell_id,name,name_subtext,spell_icon_id,school,spell_class_set) VALUES\n"
      + rows + "\nON CONFLICT (dataset_id, spell_id) DO UPDATE SET name=EXCLUDED.name,"
      " name_subtext=EXCLUDED.name_subtext, spell_icon_id=EXCLUDED.spell_icon_id,"
      " school=EXCLUDED.school, spell_class_set=EXCLUDED.spell_class_set;")
