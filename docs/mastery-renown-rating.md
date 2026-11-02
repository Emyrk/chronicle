# Mastery and Renown rating model

**Start with the [white-paper overview](mastery-renown-white-paper.md)** for the questions and motivation. This document is the technical companion, not the introduction.

Status: implementation-aligned specification for the backend in #1516. Numerical policy is configurable, not a universal default.

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
| Renown | How many configured eligible boss-kill points has Chronicle witnessed? | unbounded career and period points |

Under the illustrative 30/50/20 and 65% one-kill policy, a player with one locked 100 parse keeps a **100 Mastery estimate**, but has only **22.1% Confidence** and **65.0 Ranked Mastery**. The player is not described as mediocre; the leaderboard is merely honest about uncertainty.

## Goals

1. Preserve the meaning of Chronicle's locked, rank-one-relative parses.
2. Reward repeatable performance rather than a single lucky peak.
3. Make small-sample uncertainty visible and explainable.
4. Support a single encounter, one instance, or a configured multi-instance portfolio.
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
- `F_b`: Form, the recency-weighted median parse.
- `Q_b`: Floor, the recency-weighted 25th percentile parse.
- `n_b`: number of eligible canonical kills.
- `M_b`: boss Mastery estimate.
- `C_b`: boss Confidence.
- `E_b`: evidence multiplier used for ranking.
- `R_b`: boss Ranked Mastery.

Scores are partitioned by tenant/server, policy, selected window, content, difficulty, raid size, metric, and player class/spec/sub-spec where applicable. The competitive rank-one reference spans the tenant/server across realms; realm-group membership selects eligible content and the realm on each published score identifies its subject. Guild Peak uses clean per-boss kill time rather than a player parse. Guild Mastery uses locked, server-scoped boss time parses. Current `parse_score_results` rows do not contain every provenance field directly; production computation must join the authoritative `parse_score_receipts` metadata or persist an equivalent rating-specific source projection.

## Eligible Mastery observations

A locked parse contributes once when all of these are true:

1. It has a successful locked parse result.
2. Its logical run is canonical under `ranking_runs`.
3. The instance and encounter are eligible in the rating policy.
4. The log is listed, valid, and allowed in the tenant's ranking cohort.
5. Its metric, difficulty, raid size, class, spec, and sub-spec match the rating partition.

Duplicate uploads must not create duplicate evidence. Reparse, invalidation, deletion, unlisting, or representative-run changes must rebuild affected summaries.

## 1. Recency weights

Form and Floor emphasize recent evidence while retaining older evidence.

Illustrative half-life (configured per group):

```text
H = 42 days
```

For a retained kill that is `d_i` days older than the most recent retained kill in the selected period:

```text
w_i = 2 ^ (-d_i / H)
```

The most recent *retained* kill has weight `1`. A retained kill 42 days older has weight `0.5`; one 84 days older has weight `0.25`. The half-life is configured per group.

Age is measured relative to the most recent retained kill inside the selected scoring-period boundaries, not wall-clock time. Recency weights do not decay solely because time passes, though a rolling period can eventually exclude older observations. Freshness may be displayed separately. The period start, period end/cutoff, and latest-observation timestamp must be persisted as rating provenance because changing the selected period can change the eligible observations and weights.

### Weighted quantile algorithm

To compute a weighted quantile at probability `q`:

1. Sort eligible observations by parse ascending, then timestamp and stable result ID.
2. Starting at five eligible kills, exclude the lowest `floor(n_b * 0.2)` from Form and Floor only.
3. Sum the retained observations' recency weights as `W`.
4. Walk retained observations until cumulative weight is at least `q * W`.
5. Return that observation's parse.

The first version does not interpolate between observations. Deterministic tie-breaking is parse, timestamp, then result ID.

## 2. Best parse, Form, and Floor

For each boss:

```text
Best  P_b = max(p_i) over all eligible kills
Form  F_b = weighted_quantile(retained p_i, w_i, 0.50)
Floor Q_b = weighted_quantile(retained p_i, w_i, 0.25)
```

Interpretation:

- **Best parse** preserves demonstrated ceiling within Mastery; the competitive Peak rating separately compares raw DPS/HPS against the current tenant-wide rank one.
- **Form** carries most of the rating and describes typical recent play.
- **Floor** rewards a strong bad night and distinguishes consistent players from volatile players.

### Competitive Peak (distinct from the best locked parse)

For a player, Peak is `100 * best eligible raw DPS or HPS / tenant rank-one raw DPS or HPS` in the same boss, window, and player cohort. For a guild, Peak is `100 * tenant fastest clean boss kill time / guild fastest clean boss kill time`. Guild-less qualifying kills can establish the fastest comparison time but never earn guild credit. Rank one can improve, so an unchanged best result can receive a different normalized Peak on a later rebuild. Neither calculation replaces the existing Performance or full-clear Speedrun boards.

## 3. Boss Mastery estimate

The illustrative 30/50/20 group policy blend is:

```text
M_b = 0.30 * P_b + 0.50 * F_b + 0.20 * Q_b
```

The weights sum to one, so Mastery remains on the locked parse scale from 0 through 100.

This is the number labeled **Mastery** in the UI. Confidence never changes it. The lowest-fifth exclusion changes Form and Floor starting at five eligible kills, while best parse and evidence count still include all eligible observations.

### Why these weights?

- `30% Peak` keeps exceptional capability relevant without allowing one kill to dominate.
- `50% Form` makes repeatable typical performance the center of the rating.
- `20% Floor` rewards reliability without making early progression failures overwhelming.

These are policy constants, not immutable truths. Changing them creates a new formula version.

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

The prototype now uses a separate ranking weight, reaching full weight at five eligible kills per boss rather than waiting for descriptive Confidence to approach 100%:

```text
E_b(n) = 0.55 + 0.10 * min(n, 1)
         + 0.35 * min(max(n - 1, 0) / 4, 1)
R_b = M_b * E_b(n)
RankedCeiling(n) = 100 * E_b(n)
```

| Kills | Ranked ceiling for a 100 Mastery estimate |
| ---: | ---: |
| 1 | 65.0 |
| 2 | 73.8 |
| 3 | 82.5 |
| 4 | 91.3 |
| 5 or more | 100.0 |

The five-kill full-ranking-weight cutoff and one-kill 65% weight are the current example policy; the backend stores these constants per rating group. Confidence can continue to grow after full ranking weight is reached. Unlike the former asymptotic discount, this does not imply a 20-kill grind to approach Mastery.

The UI must show Mastery, Confidence, and Ranked Mastery together. It must not label Ranked Mastery simply as Mastery.

## 6. Instance and portfolio scopes

The same model can be viewed at three levels:

1. **Boss:** one encounter.
2. **Instance:** only eligible bosses in Molten Core, Zul'Gurub, and so on.
3. **Portfolio:** all instances selected by a versioned rating policy.

### Production aggregation

Compute each eligible boss first. For a complete, configured boss manifest with positive weights `a_b`, missing boss scores contribute zero while their weights remain in the denominator:

```text
ScopeScore = sum(a_b * BossScore_b for all eligible bosses)
           / sum(a_b for all eligible bosses)
```

This weighted average applies to raid and group Peak, Mastery, and Ranked Mastery. Renown instead sums awarded points across bosses and raids, without a denominator. One excellent boss cannot grant full scope credit for unobserved bosses. Policy selects which bosses are eligible; changing the manifest creates a new policy revision and rebuilt generation. No scope-level Confidence multiplier is applied to Ranked Mastery: aggregate already-discounted boss scores.

An absent score is not a zero-valued *parse*. Zero enters only at the scope-aggregation step. Do not display a scope score for a subject with no eligible observations.

### Prototype simplification

The existing Storybook uses curated aggregate values and average kills per observed boss. Backend scores calculate per boss first, exclude low observations where applicable, and aggregate against the full manifest. Storybook numbers must not be presented as production ratings.

### Adding new raids

A rating group has a configured list of eligible raids and bosses. Changing it increments the policy revision and rebuilds a complete new generation before publication.

Instance Mastery remains directly comparable because it is always normalized to 0–100. Renown may grow as the content catalog grows.

## 7. Prediction tooling

### Identical-performance prediction

The Storybook prediction holds Mastery fixed as a simplifying assumption. With actual per-kill observations, new kills can change the trimmed set, Form, and Floor even if performance looks similar; Confidence and the ranking weight grow until the configured full-weight kill count:

```text
ProjectedConfidence(n + k) = 1 - exp(-(n + k) / 4)
ProjectedRankedMastery = Mastery * E_b(n + k)
```

This prediction answers: “What would repeating this level of play prove?”

### Next-parse simulation

For an entered next parse `x` at timestamp `t`:

1. Append `(x, t)` to the eligible kill set.
2. Recompute best parse and trim the lowest fifth from Form/Floor if at least five eligible kills exist.
3. Recompute recency weights on retained observations, then weighted Form and Floor.
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
M = 0.30(100) + 0.50(100) + 0.20(100)
M = 100.0
```

Confidence and ranking:

```text
C = 1 - exp(-1 / 4) = 0.2212
E(1) = 0.65
R = 100.0 * 0.65 = 65.0
```

Display:

```text
Mastery:        100.0
Confidence:      22.1% — Unproven
Ranked Mastery:  65.0
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
M = 0.30(100.0) + 0.50(93.6) + 0.20(83.1)
M = 30.00 + 46.80 + 16.62
M = 93.42
```

Confidence and ranking:

```text
C = 1 - exp(-14 / 4) = 0.9698
E(14) = 1.00 (ranking discount ended at five kills)
R = 93.42 * 1.00 = 93.42
```

Display:

```text
Mastery:         93.4
Confidence:      97.0% — Established
Ranked Mastery:  93.4
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
M = 0.30(99.1) + 0.50(62.9) + 0.20(37.9)
M = 29.73 + 31.45 + 7.58
M = 68.76

C = 1 - exp(-6 / 4) = 0.7769
E(6) = 1.00
R = 68.76 * 1.00 = 68.76
```

The 99.1 best locked parse remains visible, but the Form and Floor keep it from defining the entire Mastery estimate. Competitive Peak uses raw DPS/HPS instead.

## 9. Renown

Renown is a separate source-backed kill ledger with career and configured period projections. It contains no parse, Mastery, or Ranked Mastery term.

For each eligible canonical boss kill, award the configured `boss_points` plus the configured `final_boss_bonus` if that boss is designated for the bonus:

```text
KillAward = boss_points + final_boss_bonus (when configured)
Renown = sum(KillAward for eligible canonical boss kills)
```

Each additional eligible kill earns the same configured award. There is no diminishing-return curve, fixed 50-point award, per-boss cap, or full-instance completion bonus in this implementation. A final-boss bonus is awarded on that boss's kill, not on a completed full clear. Players and guilds have separate source-backed facts and scores. A guild-less kill does not earn guild Renown.

The career window includes retained eligible evidence; the period window includes only eligible kills in the configured policy period. Deleting a source log removes facts supported only by that source. When a duplicate source remains, canonical credit survives and is reattributed; deleting the last source and re-uploading earns credit once, not twice. Daily bounded fact repair recovers missing historical facts, and complete daily generations publish the score projections. Renown repaired after a day's rating snapshot appears in the next published generation.

The former Storybook's sample Renown totals and presentation titles were exploration fixtures, not guaranteed production values. Actual points depend on the group policy and eligible manifest.

## 10. Persistence and versioning

Rating summaries identify the active generation, tenant, realm group, realm, subject, window, and score partition. Relevant source provenance includes:

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
- selected instance/boss manifest;
- recency half-life;
- formula constants.

Published standings read only a complete active generation. Daily River jobs rebuild bounded batches from a captured manifest; a policy revision change prevents a stale generation from publishing. The implementation does not promise permanently frozen historical standings.

## 11. Update model

Use an idempotent River job, not expensive row-level triggers.

Recompute affected boss partitions after:

- successful parse scoring;
- canonical `ranking_runs` representative changes;
- reparse or replacement;
- invalidation or restoration;
- listing changes or deletion;
- duplicate-group changes;
- policy changes.

The daily bounded rebuild computes boss, raid, and group projections and publishes a complete matching-revision generation. Independent daily Renown fact repair fills missing historical facts in durable pages; its results may first appear in the next daily rating generation.

## 12. Product presentation requirements

Every primary Mastery presentation must show:

1. Mastery estimate.
2. Confidence percentage and label.
3. Ranked Mastery.
4. Eligible kill count.
5. Selected scope: boss, instance, or portfolio.
6. An explanation of Peak, Form, and Floor.

Never show a confidence-discounted value labeled only “Mastery.”

Renown must be visually separate and described as career history, not player skill.

## 13. Policy and QA questions

The backend makes periods, half-life, blend weights, evidence cutoff, eligible bosses, boss weights, and Renown awards group-configurable. Before launch, configure and review each group's actual numeric policy, sparse cohorts, player and guild example histories, and the public labels. Do not treat Storybook fixtures as proof of production outcomes. A numerical or content-policy change creates a new revision and requires a complete rebuild before publication.
