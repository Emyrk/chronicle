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

## Unranked raid scope

Gruul's Lair, Serpentshrine Cavern, and Tempest Keep retain their existing
reviewed progression sets and ranked-average configuration.

Karazhan, Magtheridon's Lair, Hyjal Summit, Black Temple, Zul'Aman, and Sunwell
Plateau are cataloged for **Renown only**. Their instances and canonical bosses
are enabled, and their career entries use `include_average=false` and
`include_renown=true`. No set or member rows are created, so this change does
not present their parser hostile order as an approved ranked progression set.
Direct boss Renown and career Renown work; a default whole-raid selection still
requires a future reviewed set.

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
