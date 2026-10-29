"""new-dungeon — scaffold dungeons/<slug>/roster.yaml from a commented
template. The template's comments carry the house sculpt style learned on
Wailing Caverns: everything thick, fused to the body or base, no thin
spikes, no floating parts."""
from __future__ import annotations

import os

from .heroes import check_slug, roster_path

TEMPLATE = """\
# {title} — boss roster for mini-maker.
# Blizzard IP: private/local use only.
#
# Pipeline input for every `mini.py ... --dungeon {slug}` command. Working
# state goes to work/{slug}/<boss>/, published minis to dungeons/{slug}/<boss>/.
#
# HOUSE SCULPT STYLE (what Meshy can actually reconstruct and a printer can
# actually print — proven on wailing-caverns):
#   - Thick, chunky, toy-like volumes. Antlers "as thick as a thumb", spikes
#     are "short chunky cones", teeth "short thick cones, few in number".
#   - Everything FUSED: weapons/staffs touch a hand AND the base; snakes,
#     vines, tails are "one fat coil fused to the shoulders / the base";
#     legs and feet "merge into the base".
#   - NO thin spikes, no thin sheets (frills, fins, wings are "thick solid
#     slabs with no holes"), no loose strands, no floating sparkles or
#     particles. Glow/electricity/magic is a PAINT accent, never geometry.
#   - Hair, cloth, robes, hoods, moss are "a solid sculpted mass" / "a closed
#     solid volume down to the base".
#   - Water, smoke, ground effects are a solid sculpted shape on the base.
#   - Write a `# Shape:` comment above each boss (e.g. "bulky quadruped",
#     "robed humanoid + serpent coils") — it keeps the notes honest.
#
# FIELDS (per boss):
#   slug      lowercase kebab-case, unique; also the folder name
#   name      display name only — NEVER reaches the stills prompt (proper
#             nouns come back as painted lettering)
#   desc      appearance only, no names, no lore
#   palette   3-5 colour words (ignored for finish: grey)
#   views     [front, back] is the proven pair
#   finish    painted | grey
#   notes     sculpt constraints, in the house style above
#   back      required with a back view: what is visible from behind and
#             what is hidden (PLAYBOOK.md "Back-view rule")
#   portrait  prompt for the painted portrait (`mini.py portraits`); lore
#             words are fine here, it is not a Meshy input

name: {title}

# Appended to every boss `portrait:` as "<portrait>. <portrait_style>".
# Replace the ATMOSPHERE phrase with this dungeon's setting.
portrait_style: >-
  richly textured oil painting on rough canvas, visible brush strokes and
  impasto, painterly fantasy video-game concept art in the style of classic
  World of Warcraft loading-screen illustration, dramatic rim lighting,
  ATMOSPHERE, single subject centered, three-quarter view, full figure,
  no text, no lettering, no frame, no border

bosses: []
# Example record — copy into the list above and fill in:
#
# # Shape: bulky quadruped, shell.
# - slug: kresh
#   name: Kresh
#   desc: colossal ancient cave turtle on four thick stumpy legs, a high domed
#     mossy shell studded with chunky crystal clusters, a heavy beaked head
#   palette: [moss green, slate gray, pale crystal teal]
#   views: [front, back]
#   finish: painted
#   notes: crystals are short chunky clusters fused to the shell; legs are
#     thick and merge into the base; no thin spikes
#   back: From behind, the high domed shell fills the view, with the short
#     thick tail and both rear legs below it. The shell is plain and solid.
#   portrait: a colossal ancient cave turtle, mossy cracked armored shell
#     studded with crystals, dim flooded cavern pool
"""


class ScaffoldError(Exception):
    pass


def new_dungeon(slug, *, root=None):
    check_slug(slug, "dungeon slug")
    path = roster_path(slug, root)
    if os.path.exists(path):
        raise ScaffoldError(f"{path} already exists — not overwriting")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    title = " ".join(w.capitalize() for w in slug.split("-"))
    with open(path, "w", encoding="utf-8") as f:
        f.write(TEMPLATE.format(slug=slug, title=title))
    return path
