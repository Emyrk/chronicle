# Reviewed TBC raid Renown

Migration `000359` adds boss-default Renown awards for TBC raids. It inserts
shared configuration only; it does not scan or rewrite historical combat-log
data and it does not infer difficulty or raid-size variants.

## Awards

| Instance | Calibration | Total |
|---|---|---:|
| Karazhan | Eight ordinary bosses at 1; Nightbane and Prince Malchezaar at 3 | 14 |
| Gruul's Lair | High King Maulgar 1; Gruul 3 | 4 |
| Magtheridon's Lair | Magtheridon 3 | 3 |
| Serpentshrine Cavern | Five ordinary bosses at 2; Lady Vashj 6 | 16 |
| Tempest Keep | Three ordinary bosses at 2; Kael'thas 6 | 12 |
| Hyjal Summit | Four ordinary bosses at 3; Archimonde 7 | 19 |
| Black Temple | Eight ordinary bosses at 3; Illidan 8 | 32 |
| Zul'Aman | Five ordinary bosses at 1; Zul'jin 3 | 8 |
| Sunwell Plateau | Kalecgos, Brutallus, and Felmyst at 8; M'uru 12 | 36 |

The scale follows raid progression: introductory ten-player encounters award
one point, tier-five bosses award two, and tier-six bosses award three. Sunwell
is deliberately weighted above every other TBC raid: each configured boss is
worth at least twice an ordinary tier-six boss, and M'uru awards twelve as the
current parser-supported capstone.

## Ranked and Renown-only raid scope

Gruul's Lair, Serpentshrine Cavern, Tempest Keep, Hyjal Summit, Karazhan, and
Zul'Aman have reviewed default sets for boss parse leaderboards. Hyjal and
Zul'Aman were added in migration `000360`; Karazhan was added in migration
`000376` after complete Crusader Storm uploads confirmed the exact boss names
and kill coverage. Their career entries remain `include_average=false` and
`include_renown=true`; ranked boss parses do not imply a new career weight.

The reviewed sets were checked against complete live Crusader Storm uploads:

- Hyjal Summit: `94O5-RcMlTHVVyO4` and `83VTaZ5M1RFH8Riq`, checked on November
  10, 2026, each with all five clean boss kills in the configured order.
- Karazhan: `Um_q1dByeFC4e6F1`, checked on November 12, 2026, with all nine
  configured clean boss kills. The run had no canonical Opera or chess boss
  kill, so neither event is required for rankings or speedruns.
- Zul'Aman: `b7gvszAphwC4n8x-`, checked on November 10, 2026, with all six clean
  boss kills in the configured order (`Akil'zon`, `Nalorakk`, `Jan'alai`,
  `Halazzi`, `Hex Lord Malacrass`, `Zul'jin`).

The Hyjal, Karazhan, and Zul'Aman factories also define parser-side speedrun
requirements for the same boss rosters. This enables qualified fastest-clear
results for new parses. Existing uploads need to be reparsed before they can
populate the new speedrun boards.

Magtheridon's Lair, Black Temple, and Sunwell Plateau remain cataloged for
**Renown only**. No set or member rows are configured for them, so direct boss
and career Renown work while default whole-raid selection remains deferred.

Canonical identities come from `combatlog/parser/wotlk/instances/tbc.go`.
Auxiliary identities are excluded. In particular:

- Karazhan excludes the servant hounds, Barnes, Shade of Aran's Blizzard, and
  the chess status unit. `Echo of Medivh` is the parser's chess encounter.
- Black Temple uses aggregate `Reliquary of Souls` and `The Illidari Council`
  identities rather than their component units.
- Sunwell currently includes only Kalecgos, Brutallus, Felmyst, and M'uru.
  Eredar Twins lacks an aggregate parser identity, and Kil'jaeden is not marked
  as a boss, so neither receives an award until parser encounter identity is
  corrected.

Existing materialized career subjects detect the changed configuration
fingerprint and are refreshed by periodic career reconciliation. Deployments
that need the totals immediately can trigger that sweep rather than rewriting
the metric-free Renown fact tables.

## Validation and rollback

Integration tests verify every award, per-raid totals, canonical parser names,
Renown-only configuration for unsupported raids, mixed-flavor resolution, and
an up/down/up migration round trip. The down migration removes exact seeded
values in reverse dependency order, while later edits or references remain
protected.
