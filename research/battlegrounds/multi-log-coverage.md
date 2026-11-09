# Battlegrounds: coverage and merging several logs of one match

Follow-up to [README.md](./README.md). Question: one log is a partial view of a
match. How partial, what would more loggers add, and what would it take to
combine every upload of the same match into one replay with a visible coverage
indicator?

Status: investigation only. Numbers come from **one** real Warsong Gulch log
(one match, one logger, Horde, WoW Forever, 2026-11-09). Nothing here measures
what a second client actually records. Code references are against `main` at
`8563904b3`.

## Summary

1. **Range is the smaller problem. Silence is the bigger one.** The logger's
   bubble (hard cutoff at 300 to 316 yd, 2D) covers on average **79%** of the
   field that was played on. Yet a typical player has a fresh position (5 s
   old or less) only **about 30%** of the time, because a unit only gets a
   position when it is part of a combat event.
2. **A second logger fixes area, not silence.** Two loggers who do not stand
   together cover 93 to 99% of the field. A player who is in range but not
   fighting stays invisible to every logger.
3. **The same match can be recognised across logs**, by the server instance
   number inside Creature and GameObject GUIDs, with roster overlap as a
   fallback. The parser discards that number today.
4. **Chronicle links duplicate uploads but never merges them.** There is no
   clock alignment between logs, no source tag on stored events and no
   "position unknown" state.
5. **A real merge cannot be tested yet.** We need two logs of one match,
   ideally one per faction.

## Coverage in one log

Match window: gates open (drop of aura 422621 "Preparation") to the last
position sample on UiMap 1460, 1,590.75 s (26.5 min). Roster: 23 players with
a position on the map (13 friendly including the logger, 10 hostile).

### Players seen

"Seen" = has a position sample within the previous N seconds, as a share of
the player's time in the match.

| Group | Players | 5 s | 10 s | 30 s | Median longest dark stretch |
|---|---|---|---|---|---|
| Friendly, excluding logger | 12 | 28.9% | 39.3% | 66.6% | 98.8 s |
| Hostile | 10 | 33.5% | 45.1% | 72.6% | 124.5 s |
| The logger itself | 1 | 33.3% | 43.5% | 73.4% | 119.5 s |

The logger is always in range of itself and still scores 33% at 5 s. That is
the practical ceiling of this metric for an averagely active player.

Per 10-second bucket, a mean of 8.3 of 19.4 present players had at least one
sample (42.9%). Worst minute: the first after gates (15.8%). Best minute:
68.3%. Three buckets had no player seen at all.

### Range and area

- Hard cutoff at roughly 300 to 316 yd. With a fresh logger position (1 s old
  or less, 2,079 samples) nothing lies beyond 316.0 yd.
- No difference between events that involve the logger and third-party events.
- The MAP_CHANGE rectangle is 765 × 1,146 yd, but the convex hull of all
  observed positions is only 11.3% of it (about 620 × 230 yd). The hull is the
  honest "field".
- Share of the hull inside the logger's 300 yd bubble: mean **79.1%** (minimum
  bucket 48.4%, maximum 99.0%).

### Flags

- 21 pickups seen, 14 removals. 7 pickups have no removal in the log.
- While a flag aura was up (14 complete carries, 639.9 s), the carrier was
  seen 51.8% of the time: 62.1% for friendly carriers, 36.1% for hostile ones.

## What a second logger would add

Estimates only. Same hull, same 300 yd radius. Logger alone: 79.1%.

| Second logger | Field covered |
|---|---|
| Standing at the Alliance base end | 93.5% |
| Standing at the Horde base end (this logger is Horde) | 85.5% |
| Mirror image of the real logger | 99.8% |
| Best hostile player, last known position held | 95.1% |
| Best friendly player, last known position held | 92.7% |

An opposing-faction logger adds more than a same-faction one, because the two
sides spend their time at opposite ends. In Arathi Basin and Alterac Valley
the field is far larger than one bubble, so the gain per extra logger is
bigger there.

None of this raises the "seen" share of a player who is not in an event.
Closing that gap needs either interpolation in the replay (30 s windows
already cover about 70%) or a periodic position source from the client, which
is a data-track question.

## Recognising the same match

| Key | Verdict |
|---|---|
| Server instance number in GUIDs, e.g. `Creature-0-6808-489-30111-…` | Best key. Constant for everything spawned in the match. Behaves as a per-instance id: two Ragefire Chasm runs and a Wailing Caverns run in the same folder each carry their own number |
| Which GUID types | Trust Creature and GameObject. Pets keep the number of where they were summoned (543 Pet occurrences carried other instances' numbers) |
| When it appears | First Creature GUID 166 s after zone-in. Only 245 lines carry it. A match with no totems or traps may never show it |
| Roster overlap + map + time | Fallback. This is what PvE duplicate detection does today (`chronicle/logparse.go:1356`: same realm, zone, size, start within 30 minutes, more than 50% shared players). Two partial rosters of one battleground may overlap less than 50% |
| Today's parser | Discards the number: creature GUIDs are folded into a 24-bit hash that is unique only within one log (`combatlog/parser/blizzard/modern/guid.go:98`) |

## Aligning clocks

- Timestamps are the client's wall clock, `M/D/YYYY HH:MM:SS.ffff`. The parser
  treats them as UTC (`modern/transform.go:507`).
- The fourth fractional digit is constant per file: `1` on every line of the
  November logs, `2` on every line of an October log from the same machine,
  which was at UTC+1 and UTC+2 on those dates. It looks like the UTC offset in
  hours, appended without a sign. **Inference, not confirmed**; a log from a
  negative-offset machine would settle it. If right, the parser currently
  reads it as sub-millisecond precision and stores these logs an hour or two
  off.
- Nothing in Chronicle corrects clock differences between logs.
- Anchor candidates for alignment: the Preparation drop (all 10 starting
  players within 19 ms), then shared UNIT_DIED and flag aura events.

## Removing duplicate events

- There is no per-event id.
- The tuple (timestamp, event, source, dest, spell id, amount) collides for
  59 of 17,783 lines (0.33%); 8 lines are byte-identical pairs. An occurrence
  counter is needed, and timestamps will differ between clients, so matching
  must be fuzzy after alignment.
- Viewer-dependent fields: timestamps, unit flags (19 players change value
  within this one log), names (a pet appears as both "Unknown" and its name).
- The advanced block (HP, power, position) is fully populated for hostile
  players and looks like server state. Whether it is identical across two
  clients is unproven.

## What Chronicle has today

| Area | Today | File |
|---|---|---|
| Same run from two uploaders | Linked by `log_instances.duplicate_group_id`; each upload keeps its own page; rankings pick one representative | `chronicle/logparse.go:1356`, `database/queries/rankings.sql:30` |
| UI for it | "Duplicates" badge and modal listing recorder and uploader | `frontend/chronicle/src/pages/Instance/DuplicatesBadge.tsx` |
| Merging two users' events | Nothing | |
| Same user, overlapping file | Whole-file hash only; a prefix file is stored and parsed again | `chronicle/chronicle.go:315` |
| Combining streams | Raw byte append for one uploader's parts; a two-file timestamp merge that is CLI-only; neither removes duplicates | `chronicle/resync_worker.go:115`, `combatlog/parser/merge/merge.go` |
| Source of a stored event | No field | `api/chronicleproto/chronicle.proto:65` |
| Unknown position | No state. Replay holds the last position, or hides the unit after 15 s in whole-run mode | `Map/mapModel.ts:306`, `Map/wholeRun.ts:22` |
| Recorder character on Forever logs | Appears to be empty (read from code, not checked against a stored log) | `combatlog/parser/blizzard/modern/parser.go:183` |
| Raw log retention | Raw files can be deleted after a per-user retention period, so a late merge cannot rely on raw lines | `chronicle/retention/rawlog_worker.go` |
| Visibility | Only `unlisted`; unlisted logs are excluded from duplicate grouping | `database/queries/parsedlogs.sql:693` |

## Where a merge could live

| Option | What it means | Main obstacles |
|---|---|---|
| A. Merge raw lines before parsing | Interleave N files, parse once | One log group has one owner and one file; per-log GUID hashing; raw retention; full dedup needed up front |
| B. Merge parsed events | Build one match from N parsed streams | No source field on events; encounter ids and offsets are per upload |
| C. Keep N instances, link by match key | Extend `duplicate_group_id`; union at read time | Rankings and lists assume one representative, not a union |

### Suggested staging (for discussion, the data track decides)

1. **Link and show.** Keep the match key from Creature/GameObject GUIDs,
   group uploads of one match (option C), record the recorder character, and
   show contributors and coverage. No merge yet.
2. **Merge positions and landmark events only.** Union the position samples,
   deaths and flag auras from all linked uploads after clock alignment.
   Position samples do not need de-duplication (more samples of the same unit
   are harmless), and deaths and flag events are rare enough to match safely.
3. **Merge damage and healing.** Needs the full event de-duplication above.
   May be unnecessary if the client scoreboard provides match totals.

## Coverage UX

- **Contributors in the match header:** "3 loggers: 2 Horde, 1 Alliance",
  each a link to the uploader. Mark which sides are represented.
- **Coverage lane on the timeline:** share of present players seen per
  10-second bucket. Base it on players seen, not bubble area: 79% area and
  30 to 43% players seen describe the same log.
- **Stale units on the map:** fade a unit whose last sample is old and show
  "last seen N s ago", instead of holding it in place or hiding it.
- **Logger range rings (toggle):** the 300 yd bubble per contributor, so dark
  parts of the field are explained.
- **Flag lanes:** hatch the stretches where the carrier or the flag state is
  unknown.
- **Invitation:** "Were you in this match? Add your log" on a match with
  one-sided or thin coverage.

## Open questions (additions to the list in #1734)

11. Can the parser keep the server instance number from Creature and
    GameObject GUIDs as a match key?
12. Is the fourth fractional timestamp digit the UTC offset? If so, v22 logs
    are stored off by that many hours today.
13. Where should the union happen: linked instances first, merged events
    later?
14. Can the addon sample player and team map positions on a timer during a
    match? That would address silence, which extra loggers cannot.
15. May one uploader's data be shown inside another uploader's view of the
    match, and what should an unlisted upload contribute?

## To test this for real

Two logs of the same match, advanced logging on, ideally one Horde and one
Alliance. That would confirm the match key, measure the clock offset, show
whether the advanced block is identical across clients, and replace the
estimates above with measurements.
