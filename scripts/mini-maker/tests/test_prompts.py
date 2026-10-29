import os
import sys
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (os.path.join(_ROOT, "scripts"), os.path.join(_ROOT, ".pylib")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mini_lib.heroes import load_heroes, normalize
from mini_lib.prompts import build_prompt, drop_negative_clauses, strip_colors

HERO = {
    "slug": "test-hero",
    "name": "Kaelthys the Unspoken",
    "desc": "a plain figure with deep indigo-blue skin and a silver-black cloak",
    "palette": ["deep indigo", "teal", "pearl white"],
    "views": ["front", "back"],
    "finish": "painted",
    "notes": "the staff is thick; he carries no bow, no arrows and no quiver",
    "back": "From behind, the cloak and hair are visible; the staff is hidden by the body.",
}


class NameLeakTests(unittest.TestCase):
    def test_name_never_in_prompt(self):
        hero = normalize(HERO)
        for view in hero["views"]:
            prompt = build_prompt(hero, view)
            self.assertNotIn(hero["name"].lower(), prompt.lower())

    def test_all_real_bosses_never_leak_name(self):
        heroes = load_heroes(os.path.join(_ROOT, "dungeons", "wailing-caverns", "roster.yaml"))
        for hero in heroes:
            for view in hero["views"]:
                prompt = build_prompt(hero, view)
                self.assertNotIn(hero["name"].lower(), prompt.lower())

    def test_leaked_name_raises(self):
        hero = normalize(HERO)
        hero = dict(hero)
        hero["desc"] = hero["desc"] + " " + hero["name"]
        with self.assertRaises(AssertionError):
            build_prompt(hero, "front")


class GreyFinishTests(unittest.TestCase):
    def test_strip_colors_removes_palette_and_generic_words(self):
        stripped = strip_colors("a plain figure with deep indigo-blue skin and a silver-black cloak",
                                 ["deep indigo", "teal", "pearl white"])
        for word in ("indigo", "blue", "silver", "black", "deep"):
            self.assertNotIn(word, stripped.lower())

    def test_grey_prompt_has_no_palette_line_and_no_color_words(self):
        hero = normalize({**HERO, "finish": "grey"})
        prompt = build_prompt(hero, "front")
        self.assertNotIn("Colours:", prompt)
        for token in ("indigo", "teal", "pearl", "silver", "black"):
            self.assertNotIn(token, prompt.lower())

    def test_painted_prompt_keeps_palette_line(self):
        hero = normalize(HERO)
        prompt = build_prompt(hero, "front")
        self.assertIn("Colours: deep indigo, teal, pearl white", prompt)


class BackViewTests(unittest.TestCase):
    def test_back_drops_no_clause(self):
        cleaned = drop_negative_clauses("the staff is thick; he carries no bow, no arrows and no quiver")
        self.assertEqual(cleaned, "the staff is thick")

    def test_back_prompt_drops_no_clause_and_adds_hidden_sentence(self):
        hero = normalize(HERO)
        prompt = build_prompt(hero, "back")
        self.assertNotIn("no bow", prompt)
        self.assertNotIn("no arrows", prompt)
        self.assertIn("hidden by the body", prompt)

    def test_front_prompt_keeps_no_clause(self):
        hero = normalize(HERO)
        prompt = build_prompt(hero, "front")
        self.assertIn("no bow", prompt)


if __name__ == "__main__":
    unittest.main()
