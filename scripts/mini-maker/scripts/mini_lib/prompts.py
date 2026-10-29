"""Prompt assembly.

The prose blocks are PLAYBOOK.md's; the assembly order (SCULPT, then the
hero's SUBJECT, then VIEW/SAME/back-sentence, then SHOT, then TAIL) matches
`probes/2026-09-27/mkspec.py`, the proven-working throwaway this replaces —
PLAYBOOK.md's own "Assembled in this order" line lists SUBJECT first, but
the order below is what actually produced the 16 approved probe stills.
"""
from __future__ import annotations

import re

SCULPT_PAINTED = (
    "A single tabletop board-game miniature figure, a hand-painted collectible "
    "sculpt with simplified chunky toy-like volumes and thick sturdy shapes, matte paint, "
    "standing in a stable iconic pose on one plain round base that is attached under its "
    "feet. Every part of the figure is solid and connected to the body; hair, cloth and "
    "effects are sculpted as thick solid masses. "
)
SCULPT_GREY = (
    "A single tabletop board-game miniature figure, an unpainted collectible "
    "sculpt in uniform matte light-grey primer with simplified chunky toy-like volumes and "
    "thick sturdy shapes, standing in a stable iconic pose on one plain round base that is "
    "attached under its feet. Every part of the figure is solid and connected to the body; "
    "hair, cloth and effects are sculpted as thick solid masses. "
)
VIEWS = {
    "front": "Seen straight from the front. ",
    "back": "The same figure seen from directly behind, showing its back. ",
}
SAME = (
    "This is the identical miniature shown in the reference image — same pose, same "
    "proportions, same base, same scale — rotated in place. The camera has not moved. "
)
SHOT = (
    "Studio product photograph on a plain pure-white seamless background, camera at the "
    "figure's mid-height, long lens with flat perspective, even soft diffuse lighting from "
    "all sides with no cast shadow. The whole figure and its base are fully visible and "
    "centred, filling most of the frame with a small white margin on every side. One single "
    "figure, one single view. "
)
TAIL = "no text, no lettering, no border, no frame, no watermark"

# Base colour vocabulary stripped from `desc` for finish: grey (probes/README.md
# finding 6). Hero-specific palette words are added on top per call, so a
# hero's own palette (e.g. "moss green") is always covered even if not listed
# here.
GENERIC_COLOR_WORDS = (
    "red", "orange", "yellow", "green", "blue", "indigo", "violet", "purple", "pink",
    "brown", "black", "white", "grey", "gray", "silver", "gold", "golden", "bronze",
    "copper", "verdigris", "amber", "teal", "aquamarine", "turquoise", "maroon",
    "crimson", "scarlet", "azure", "cyan", "magenta", "ivory", "ebony", "charcoal",
    "tan", "beige", "pearl", "pearlescent",
)


def _color_strip_pattern(palette):
    words = set(GENERIC_COLOR_WORDS)
    for entry in palette:
        for tok in re.split(r"[\s-]+", entry):
            tok = tok.strip().lower()
            if tok:
                words.add(tok)
    ordered = sorted(words, key=len, reverse=True)
    alt = "|".join(re.escape(w) for w in ordered)
    # allow one hyphenated compound of two colour words, e.g. "indigo-blue"
    return re.compile(rf"\b(?:{alt})(?:-(?:{alt}))?\b", re.IGNORECASE)


def strip_colors(text, palette):
    """finish: grey — strip colour words from `desc` (probes/README.md #6)."""
    pattern = _color_strip_pattern(palette)
    stripped = pattern.sub("", text)
    stripped = re.sub(r"\s{2,}", " ", stripped)
    stripped = re.sub(r"\s+([,.;])", r"\1", stripped)
    stripped = re.sub(r",\s*,", ",", stripped)
    stripped = re.sub(r"^[,;\s]+", "", stripped)
    return stripped.strip()


def drop_negative_clauses(notes):
    """Back views drop any "no X" clause from notes (probes/README.md #3)."""
    clauses = [c.strip() for c in notes.split(";")]
    kept = [c for c in clauses if c and not re.search(r"\bno\b", c, re.IGNORECASE)]
    return "; ".join(kept)


def build_prompt(hero, view):
    if view not in VIEWS:
        raise ValueError(f"unsupported view for prompting: {view!r}")

    desc = hero["desc"].rstrip(".")
    notes = hero["notes"].rstrip(".")
    if view == "back":
        notes = drop_negative_clauses(notes)
    if hero["finish"] == "grey":
        desc = strip_colors(desc, hero["palette"])

    subject = desc + ". "
    if hero["finish"] == "painted":
        subject += "Colours: " + ", ".join(hero["palette"]) + ". "
    if notes:
        subject += notes + ". "

    sculpt = SCULPT_PAINTED if hero["finish"] == "painted" else SCULPT_GREY
    parts = [sculpt, subject, VIEWS[view]]
    if view != "front":
        parts.append(SAME)
        if view == "back":
            parts.append(hero["back"].rstrip(".") + ". ")
    parts.append(SHOT)
    parts.append(TAIL)
    prompt = "".join(parts)

    if hero["name"].strip().lower() in prompt.lower():
        raise AssertionError(f"hero name leaked into prompt for {hero['slug']}/{view}")
    return prompt
