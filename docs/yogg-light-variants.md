# Yogg-Saron light-count variants

Yogg-Saron uses five exact encounter variants: `lights_0` through `lights_4`.
Combined includes all eligible kills, including unclassified historical rows.
The leaderboard Hard mode shortcut selects `lights_0`; both 0 and 1 Light are
hard modes, but they are separate cohorts.

## Evidence and coverage

The shared parse-wide aura tracker owns aura state. Ulduar collects a pull-time
snapshot and positive lifecycle notifications for these buffs on players:

| Keeper | Spell | Buff |
| --- | --- | --- |
| Freya | 62670 | Resilience of Nature |
| Hodir | 62650 | Fortitude of Frost |
| Thorim | 62702 | Fury of the Storm |
| Mimiron | 62671 | Speed of Invention |

Each distinct keeper observed active during the parsed encounter counts once.
Removals alone are not positive evidence. Pre-pull removals and inferred expiry
are honored by the existing tracker. Earlier encounters cannot contribute their
observed keeper set to later encounters; only buffs still active at the next pull
can carry forward. Evidence is bounded by the finalized encounter timestamps.
This does not change the parser's encounter grouping, timing, or phase logic.

Only clean and partial kills are classified. Existing board eligibility remains
unchanged, so classification does not make partial kills eligible for boards
that require clean kills.

For 0 through 3 Light, another recorded encounter must have ended before this
encounter started in the same parsed instance. This can be a wipe or trash
encounter; it need not be a successful boss kill. Standalone 0-3 Light logs stay
unclassified. Observing all four keepers is sufficient positive evidence for
4 Light. Prior encounter coverage is a heuristic, not proof that recording was
uninterrupted; stopping and restarting recording in one file is not detected.

## Display and ranking identity

The report badge shows the exact light count. Its optional tooltip lists the
observed keepers and buffs, or says no keepers assisted for a classified 0 Light.
`encounter_variant_tooltip` is display-only. It is not copied to ranking rows,
cohort keys, filters, fingerprints, or scoring inputs.

New parses also persist `encounter_variant_tooltip_data`, for example
`{"type":"yogg-light","auras":[62702]}`. Report badges use this optional payload
to show dataset-aware spell icons and keeper names. Zero Light uses an empty
array. Unknown formats or absent structured data retain the plain-text tooltip.
The plain-text field remains unchanged for consumers without rich rendering.
Existing text-only rows need a source reparse to gain the structured payload;
there is no inferred conversion from prose or automatic backfill.

Different keeper choices
with the same count share one cohort.

Career ratings, Renown, summaries, and speedruns retain their existing Combined
behavior. Existing exact-statistics restrictions remain in effect. Historical
rows are not backfilled; exact classification requires reparsing source logs.

## Migration and rollout

Migration 000389 adds a nullable report-tooltip column and broadens twelve exact
variant CHECK constraints. Replacement constraints are NOT VALID to avoid a
startup scan; existing validated normal/hard rows already satisfy the expanded
domain, and future inserts and updates are checked immediately. There is no data
rewrite or backfill. Metadata locks are still required; a five-second lock timeout
fails the migration rather than waiting indefinitely behind long transactions.

Rollback drops the tooltip column but deliberately retains the expanded key
domain, avoiding a scan or deletion of already published light-count history.
Deploying an older binary will not provide the new selectors or detection.

Start rollout with a bounded source reparse. Verify the report badge and tooltip,
exact DPS/HPS parse membership, and exact player/guild rating publication. Keep
Combined results and speedrun timing unchanged before requesting wider reparses.

Migration 000390 adds only the nullable JSONB tooltip payload column, without a
default or backfill. It uses the same five-second metadata-lock timeout.
