import os
import sys
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib.heroes import HeroError, load_heroes, load_roster, normalize, select

BASE = {
    "slug": "test-hero",
    "name": "Test Hero",
    "desc": "a plain figure",
    "palette": ["storm gray"],
    "views": ["front", "back"],
    "finish": "painted",
    "notes": "nothing special",
    "back": "From behind, nothing else is visible.",
}


class NormalizeTests(unittest.TestCase):
    def test_front_is_first_and_always_present(self):
        h = normalize({**BASE, "views": ["back", "front"]})
        self.assertEqual(h["views"][0], "front")
        self.assertEqual(set(h["views"]), {"front", "back"})

    def test_front_added_if_missing(self):
        h = normalize({**BASE, "views": ["back"]})
        self.assertEqual(h["views"], ["front", "back"])

    def test_unsupported_view_rejected(self):
        for view in ("side", "three-quarter"):
            with self.subTest(view=view):
                with self.assertRaises(HeroError) as ctx:
                    normalize({**BASE, "views": ["front", view]})
                self.assertIn("not supported yet", str(ctx.exception))

    def test_unknown_view_rejected(self):
        with self.assertRaises(HeroError):
            normalize({**BASE, "views": ["front", "diagonal"]})

    def test_bad_finish_rejected(self):
        with self.assertRaises(HeroError):
            normalize({**BASE, "finish": "matte"})

    def test_back_view_requires_back_sentence(self):
        record = dict(BASE)
        del record["back"]
        with self.assertRaises(HeroError):
            normalize(record)

    def test_missing_field_rejected(self):
        record = dict(BASE)
        del record["desc"]
        with self.assertRaises(HeroError):
            normalize(record)

    def test_seed_is_deterministic(self):
        h1 = normalize(BASE)
        h2 = normalize(BASE)
        self.assertEqual(h1["seed"], h2["seed"])
        self.assertFalse(h1["seed_sent"])

    def test_portrait_is_optional_and_passes_through(self):
        self.assertIsNone(normalize(BASE)["portrait"])
        self.assertEqual(normalize({**BASE, "portrait": "a plain figure"})["portrait"], "a plain figure")

    def test_portrait_must_be_string(self):
        with self.assertRaises(HeroError):
            normalize({**BASE, "portrait": ["a", "b"]})


WC_ROSTER = os.path.join(_ROOT, "dungeons", "wailing-caverns", "roster.yaml")
WC_BOSSES = [
    "kresh", "lady-anacondra", "lord-pythas", "lord-cobrahn", "skum", "lord-serpentis",
    "verdan-the-everliving", "mutanus-the-devourer", "deviate-faerie-dragon",
]


class LoadRosterTests(unittest.TestCase):
    def test_loads_wailing_caverns_roster(self):
        roster = load_roster(WC_ROSTER)
        self.assertEqual(roster["name"], "Wailing Caverns")
        self.assertIn("oil painting", roster["portrait_style"])
        self.assertEqual([h["slug"] for h in roster["bosses"]], WC_BOSSES)
        for h in roster["bosses"]:
            self.assertEqual(h["views"][0], "front")
            self.assertTrue(h["portrait"])

    def test_load_heroes_returns_the_bosses(self):
        self.assertEqual([h["slug"] for h in load_heroes(WC_ROSTER)], WC_BOSSES)

    def test_select_filters_and_preserves_order(self):
        heroes = load_heroes(WC_ROSTER)
        picked = select(heroes, ["skum", "kresh"])
        self.assertEqual([h["slug"] for h in picked], ["skum", "kresh"])

    def test_select_unknown_slug_rejected(self):
        with self.assertRaises(HeroError):
            select(load_heroes(WC_ROSTER), ["not-a-real-boss"])

    def _load(self, doc):
        import tempfile
        import yaml
        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            yaml.safe_dump(doc, f)
            path = f.name
        try:
            return load_roster(path)
        finally:
            os.remove(path)

    def test_list_roster_rejected(self):
        with self.assertRaises(HeroError):
            self._load([BASE])

    def test_duplicate_slugs_rejected(self):
        with self.assertRaises(HeroError):
            self._load({"bosses": [BASE, BASE]})

    def test_empty_roster_loads(self):
        self.assertEqual(self._load({"name": "X", "bosses": []})["bosses"], [])

    def test_missing_roster_names_new_dungeon(self):
        with self.assertRaises(HeroError) as ctx:
            load_roster(os.path.join(_ROOT, "dungeons", "no-such-dungeon", "roster.yaml"))
        self.assertIn("new-dungeon", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
