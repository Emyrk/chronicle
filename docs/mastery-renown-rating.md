# Mastery and Renown rating model

**Start with the [white-paper overview](mastery-renown-white-paper.md)** for the questions and motivation. This document is the technical companion, not the introduction.

Status: specification of the tenant rating backend on `main`. The numerical policy below is a fixed product rule, versioned and frozen into each rebuild; it is not an admin setting.

The existing Storybook examples on `main` are illustrative; they are not production score fixtures.

## Summary

Chronicle persists each successful parse as a 0–100 measurement of how close that performance was to the best result in the cohort and 60-day window used at scoring time. This document uses “locked parse” as shorthand for that persisted score result; it does not imply an immutable cohort snapshot. Mastery uses those locked observations without changing them; Renown instead credits eligible source-backed boss kills, and Peak uses raw performance or kill time.

The model deliberately exposes distinct concepts instead of hiding them in one opaque number:

| Concept | Question | Range |
| --- | --- | ---: |
| Parse | How strong was this kill? | 0–100 |
| Mastery | What repeatable performance does the observed record suggest? | 0–100 |
| Confidence | How much evidence supports that estimate? | 0–100% |
| Ranked Mastery | What conservative value should a leaderboard compare? | 0–100 |
| Renown | How many eligible boss-kill points has Chronicle witnessed? | unbounded career and period points |

Under the current 35/50/15 policy with a 50% one-kill ranking weight, a player with one locked 100 parse keeps a **100 Mastery estimate**, but has only **22.1% Confidence** and **50.0 Ranked Mastery**. The player is not described as mediocre; the leaderboard is merely honest about uncertainty.

## Goals

1. Preserve the meaning of Chronicle's locked, rank-one-relative parses.
2. Reward repeatable performance rather than a single lucky peak.
3. Make small-sample uncertainty visible and explainable.
4. Support a single encounter, one raid, or any chosen set of a raid's bosses.
5. Keep Mastery normalized when new raids are added.
6. Let Renown grow as a career record without pretending longevity is skill.
7. Keep all formulas versioned and reproducible.

## Non-goals

- Replace the original parse or best-parse leaderboard.
- Claim that DPS/HPS alone captures every form of player skill.
- Merge characters or alts without an explicit identity policy.
- Re-score a locked historical parse when a later rank-one result appears.
- Hide low sample size behind a single unexplained rating.

## Terms and notation

For a player, metric, specialization, scoring period, and boss `b`:

- `p_i`: locked Chronicle parse for kill `i`, from 0 through 100.
- `t_i`: kill timestamp.
- `P_b`: best eligible locked parse used in Mastery (distinct from raw-performance Peak).
- `F_b`: Form, the median retained parse.
- `Q_b`: Floor, the 25th-percentile retained parse.
- `n_b`: number of eligible canonical kills.
- `M_b`: boss Mastery estimate.
- `C_b`: boss Confidence.
- `E_b`: evidence multiplier used for ranking.
- `R_b`: boss Ranked Mastery.

Scores are partitioned by tenant/server, policy version, window, content, difficulty, raid size, metric, and player class/spec/sub-spec where applicable. The competitive rank-one reference spans the tenant/server across realms; the realm on each published score identifies its subject, and realm filters on the leaderboards only narrow who is listed. Guild Peak uses clean per-boss kill time rather than a player parse. Guild Mastery uses locked, server-scoped boss time parses. Current `parse_score_results` rows do not contain every provenance field directly; production computation must join the authoritative `parse_score_receipts` metadata or persist an equivalent rating-specific source projection.

## Eligible Mastery observations

A locked parse contributes once when all of these are true:

1. It has a successful locked parse result.
2. Its logical run is canonical under `ranking_runs`.
3. The instance and encounter are eligible in the rating policy.
4. The log is listed, valid, and allowed in the tenant's ranking cohort.
5. Its metric, difficulty, raid size, class, spec, and sub-spec match the rating partition.

Duplicate uploads must not create duplicate evidence. Reparse, invalidation, deletion, unlisting, or representative-run changes must rebuild affected summaries.

## 1. Windows and retained kills

Each rating has two windows: the last **180 days** (the leaderboards' default) and **all time** (Renown calls this its career). Within a window, every eligible kill counts equally; there is no recency weighting. Older kills leave the 180-day window as it rolls forward, and the all-time window keeps them.

Form and Floor ignore the weakest kills once there are enough of them:

1. Sort eligible observations by parse ascending, then timestamp and stable result ID.
2. Starting at five eligible kills, exclude the lowest `floor(n_b / 5)` from Form and Floor only.
3. Take the lower nearest-rank quantile of the retained kills: Form is the retained kill at index `floor((r - 1) / 2)`, Floor the one at `floor((r - 1) / 4)`, where `r` is the number retained.

There is no interpolation between observations. The best parse and the evidence count still include every eligible kill.

## 2. Best parse, Form, and Floor

For each boss:

```text
Best  P_b = max(p_i) over all eligible kills
Form  F_b = lower median of retained p_i
Floor Q_b = lower 25th percentile of retained p_i
```

Interpretation:

- **Best parse** preserves demonstrated ceiling within Mastery; the competitive Peak rating separately compares raw DPS/HPS against the current tenant-wide rank one.
- **Form** carries most of the rating and describes typical play in the window.
- **Floor** rewards a strong bad night and distinguishes consistent players from volatile players.

### Competitive Peak (distinct from the best locked parse)

For a player, Peak is `100 * best eligible raw DPS or HPS / tenant rank-one raw DPS or HPS` in the same boss, window, and player cohort (class, spec, and sub-spec), so every cohort's rank one scores 100. Each boss Peak keeps the DPS/HPS of that best kill and its fight length. When Peaks tie, the higher DPS/HPS ranks first. For a guild, Peak is `100 * tenant fastest clean boss kill time / guild fastest clean boss kill time`. Guild-less qualifying kills can establish the fastest comparison time but never earn guild credit. Rank one can improve, so an unchanged best result can receive a different normalized Peak on a later rebuild. Neither calculation replaces the existing Performance or full-clear Speedrun boards.

## 3. Boss Mastery estimate

The current policy blend is:

```text
M_b = 0.35 * P_b + 0.50 * F_b + 0.15 * Q_b
```

The weights sum to one, so Mastery remains on the locked parse scale from 0 through 100.

This is the number labeled **Mastery** in the UI. Confidence never changes it. The lowest-fifth exclusion changes Form and Floor starting at five eligible kills, while best parse and evidence count still include all eligible observations.

### Why these weights?

- `35% best parse` keeps exceptional capability relevant without allowing one kill to dominate.
- `50% Form` makes repeatable typical performance the center of the rating.
- `15% Floor` rewards reliability without making early progression failures overwhelming.

These are policy constants, not immutable truths. Changing them creates a new rules version and a full rebuild.

## 4. Confidence

Confidence uses eligible kill count with diminishing returns:

```text
C_b = 1 - exp(-n_b / 4)
```

Selected values:

| Kills | Confidence | Interpretation |
| ---: | ---: | --- |
| 0 | 0.0% | no estimate |
| 1 | 22.1% | unproven |
| 2 | 39.3% | early evidence |
| 3 | 52.8% | emerging |
| 5 | 71.3% | credible |
| 8 | 86.5% | proven |
| 14 | 97.0% | established |
| 20 | 99.3% | effectively saturated |

Confidence never reaches exactly 100%. Additional kills remain evidence, but the provisional ranking discount ends at five kills per boss; Confidence is descriptive rather than the ranking multiplier.

Suggested display labels:

| Confidence | Label |
| ---: | --- |
| below 35% | Unproven |
| 35%–59.9% | Emerging |
| 60%–79.9% | Credible |
| 80%–94.9% | Proven |
| 95% and above | Established |

## 5. Ranked Mastery

Mastery is the estimate. Ranked Mastery is the conservative comparison value.

A separate ranking weight reaches full weight at five eligible kills per boss rather than waiting for descriptive Confidence to approach 100%. It starts at 50% for one kill and rises linearly:

```text
E_b(n) = 0.50 + 0.50 * (min(n, 5) - 1) / 4      for n >= 1
R_b = M_b * E_b(n)
RankedCeiling(n) = 100 * E_b(n)
```

| Kills | Ranked ceiling for a 100 Mastery estimate |
| ---: | ---: |
| 1 | 50.0 |
| 2 | 62.5 |
| 3 | 75.0 |
| 4 | 87.5 |
| 5 or more | 100.0 |

Zul'Gurub's Edge of Madness bosses (Gri'lek, Hazza'rah, Renataki, Wushoolay) rotate, so each earns full ranking weight after one kill. Confidence can continue to grow after full ranking weight is reached; this does not imply a 20-kill grind to approach Mastery.

The UI must show Mastery, Confidence, and Ranked Mastery together. It must not label Ranked Mastery simply as Mastery.

## 6. Boss and raid scopes

Ratings exist per boss and per raid. There is no multi-raid portfolio.

1. **Boss:** one encounter.
2. **Raid:** an instance such as Molten Core or Zul'Gurub.
3. **Chosen bosses:** on the leaderboard hub, any set of a raid's bosses picked in the encounter list.

### Raid aggregation

Compute each boss first, then average with equal weights. Renown instead sums awarded points across bosses, without a denominator.

- **Raid Peak** averages every boss on the raid's roster for the realm's game flavor, optional bosses included; a boss without a Peak counts as zero, so one excellent boss cannot grant full raid credit. Zul'Gurub's four Edge of Madness bosses form one slot that takes the best of them. A raid with no curated roster averages the bosses that have a score.
- **Raid Peak DPS/HPS** is total output over total fight time across the counted bosses' best kills, so long fights weigh more than short ones.
- **Raid Ranked Mastery** published per raid averages the bosses that have a score.
- **Chosen bosses** on the hub are computed on request from the boss scores: Peak and Ranked Mastery average every chosen boss with a missed one as zero, and Renown sums.

An absent score is not a zero-valued *parse*. Zero enters only at the aggregation step. Do not display a scope score for a subject with no eligible observations.

### Adding new raids

The eligible bosses come from the curated per-flavor roster. Changing it is a new rules version, and a complete new generation is rebuilt before publication. Raid scores stay comparable because they remain normalized to 0–100. Renown may grow as the content catalog grows.

## 7. Prediction tooling

### Identical-performance prediction

The Storybook prediction holds Mastery fixed as a simplifying assumption. With actual per-kill observations, new kills can change the trimmed set, Form, and Floor even if performance looks similar; Confidence and the ranking weight grow until five kills:

```text
ProjectedConfidence(n + k) = 1 - exp(-(n + k) / 4)
ProjectedRankedMastery = Mastery * E_b(n + k)
```

This prediction answers: “What would repeating this level of play prove?”

### Next-parse simulation

For an entered next parse `x` at timestamp `t`:

1. Append `(x, t)` to the eligible kill set.
2. Recompute best parse and trim the lowest fifth from Form/Floor if at least five eligible kills exist.
3. Recompute Form and Floor on the retained observations.
4. Recompute Mastery, Confidence, and Ranked Mastery.
5. Display before/after values and explain which component changed.

This answers: “What happens if my next parse is 85?”

The simulator must be labeled hypothetical and must never write production scores. Its aggregate Storybook approximation does not simulate per-boss outlier exclusion.

## 8. Worked examples

These examples use curated Storybook summaries to illustrate the formula. The multi-kill aggregate inputs are not recomputed from per-boss retained observations and do not validate the low-kill exclusion. They are not published ratings.

### Example A: one perfect kill

Inputs:

```text
Best parse = 100
Form = 100
Floor = 100
Kills = 1
```

Mastery:

```text
M = 0.35(100) + 0.50(100) + 0.15(100)
M = 100.0
```

Confidence and ranking:

```text
C = 1 - exp(-1 / 4) = 0.2212
E(1) = 0.50
R = 100.0 * 0.50 = 50.0
```

Display:

```text
Mastery:        100.0
Confidence:      22.1% — Unproven
Ranked Mastery:  50.0
```

### Example B: Port in Molten Core

Illustrative Storybook aggregate inputs (not computed from the per-boss observation histories):

```text
Best parse = 100.0
Form = 93.6
Floor = 83.1
Average kills per boss = 14
```

Mastery:

```text
M = 0.35(100.0) + 0.50(93.6) + 0.15(83.1)
M = 35.00 + 46.80 + 12.47
M = 94.27
```

Confidence and ranking:

```text
C = 1 - exp(-14 / 4) = 0.9698
E(14) = 1.00 (ranking discount ended at five kills)
R = 94.27 * 1.00 = 94.27
```

Display:

```text
Mastery:         94.3
Confidence:      97.0% — Established
Ranked Mastery:  94.3
```

### Example C: high peak, volatile record

Illustrative Storybook aggregate (not computed from the per-boss observation histories):

```text
Best parse = 99.1
Form = 62.9
Floor = 37.9
Average kills per boss = 6
```

```text
M = 0.35(99.1) + 0.50(62.9) + 0.15(37.9)
M = 34.69 + 31.45 + 5.69
M = 71.82

C = 1 - exp(-6 / 4) = 0.7769
E(6) = 1.00
R = 71.82 * 1.00 = 71.82
```

The 99.1 best locked parse remains visible, but the Form and Floor keep it from defining the entire Mastery estimate. Competitive Peak uses raw DPS/HPS instead.

## 9. Renown

Renown is a separate source-backed kill ledger with career and 180-day period projections. It contains no parse, Mastery, or Ranked Mastery term.

Each eligible canonical boss kill earns that boss's points from the curated roster for the realm's game flavor:

```text
Renown = sum(boss_points for eligible canonical boss kills)
```

Bosses are weighted differently. In vanilla Molten Core most bosses are worth 1, Majordomo Executus 2, and Ragnaros 5; Zul'Gurub's High Priests are 0 and Hakkar 3; Onyxia is 2. Realms on other game flavors add or replace bosses from their own lists (for example, Molten Core's added bosses on Turtle WoW). Each additional eligible kill earns the same award. There is no diminishing-return curve, per-boss cap, separate final-boss bonus, or full-clear bonus. Players and guilds have separate source-backed facts and scores. A guild-less kill does not earn guild Renown.

Deleting a source log removes facts supported only by that source. When a duplicate source remains, canonical credit survives and is reattributed; deleting the last source and re-uploading earns credit once, not twice. Daily bounded fact repair recovers missing historical facts, and Renown repaired after a day's rating snapshot appears in the next published generation.

## 10. Persistence and versioning

Rating summaries identify the active generation, tenant, realm, subject, window, and score partition. Relevant source provenance includes:

```text
policy_version
period_start
period_end_or_cutoff
parse_score_receipt_id_or_source_generation
player_guid
realm_id
instance_name nullable
encounter_name nullable
metric
class
spec
sub_spec
```

Illustrative boss Mastery fields:

```text
peak
form
floor
mastery_estimate
confidence
ranked_mastery
eligible_kills
eligible_bosses
observed_bosses
last_kill_at
computed_at
source_generation
```

Renown should have a separate projection because its lifecycle and semantics differ from Mastery.

Every result must store or reference:

- formula/policy version;
- parse cohort and scoring-period version;
- source generation or canonical run set;
- the curated per-flavor boss roster;
- formula constants.

Published standings read only a complete active generation. Daily River jobs rebuild bounded batches from a captured manifest; a policy revision change prevents a stale generation from publishing. The implementation does not promise permanently frozen historical standings.

## 11. Update model

A daily River job rebuilds every rating tenant from scratch in bounded, checkpointed pages: stage the evidence, project boss scores, accumulate Mastery, then project raid scores. Each rebuild freezes the rules version, policy constants, and per-realm boss roster into its checkpoint, and the generation is published only once every phase completes. A rules change stops a stale build from publishing. There are no row-level triggers; reparses, invalidations, deletions, and duplicate changes show up in the next daily generation. Independent daily Renown fact repair fills missing historical facts, which appear in the next generation.

## 12. Product presentation requirements

Every primary Mastery presentation must show:

1. Mastery estimate.
2. Confidence percentage and label.
3. Ranked Mastery.
4. Eligible kill count.
5. Selected scope: boss, raid, or chosen bosses.
6. An explanation of the best locked parse, Form, and Floor.

Never show a confidence-discounted value labeled only “Mastery.”

Renown must be visually separate and described as career history, not player skill.

## 13. Policy and QA questions

The period, blend weights, ranking-weight curve, low-kill exclusion, boss rosters, and Renown points are fixed product rules, versioned and frozen into each rebuild; no admin setting changes them. Before launch, review sparse cohorts, player and guild example histories, and the public labels against published generations. Do not treat Storybook fixtures as proof of production outcomes. Any rules change is a new version and needs a complete rebuild before publication.
