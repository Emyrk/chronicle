/** Code-mode syntax by example: [code, note]. Shown in the editor's Syntax panel and the guide. */
export const CEL_CHEATSHEET: [string, string][] = [
  [`instance.name.contains("molten")`, "partial, case-insensitive"],
  [`instance.name == "Molten Core"`, "exact (case-insensitive)"],
  [`instance.clear_parse({"parse_scope": "realm"}) >= 95`, "options go in ({...})"],
  [`instance.kill_time_parse({"bosses": ["Ragnaros", "Nefarian"], "match": "each"}) >= 90`, "any / each of a boss list"],
  [`encounters.exists(e, e.name == "Ragnaros" && e.killed == true)`, "a pull where…"],
  [`encounters.filter(e, e.outcome == "wipe").size() >= 5`, "count pulls"],
  [`players.exists(p, p.sub_spec == "Bear" && p.sub_spec == "Cat")`, "same player"],
  [`players.filter(p, p.class == "PRIEST").size() >= 3`, "count players"],
  [`p.spec({"on": "trash"}) == "Feral"`, "on: bosses (default), trash, any"],
  [`"unit-position" in instance.capabilities`, "log capability"],
  [`instance.started_at >= timestamp("2026-10-01T00:00:00Z")`, "dates"],
  [`!(…)  a && b  a || b  x in ["a", "b"]`, "not, and, or, lists"],
];

