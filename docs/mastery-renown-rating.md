# Mastery and Renown rating model

**Start with the [white-paper pitch](mastery-renown-white-paper.md)** for the questions, motivation, and decision gate. This document is the technical companion, not the introduction.

Status: exploratory specification

Prototype: `Pages/Armory/Mastery & Renown` in Storybook

## Summary

Chronicle persists each successful parse as a 0–100 measurement of how close that performance was to the best result in the cohort and 60-day window used at scoring time. This document uses “locked parse” as shorthand for that persisted score result; it does not imply an immutable cohort snapshot. Mastery and Renown build on those persisted observations without changing them.

The model deliberately exposes five different concepts instead of hiding them in one opaque number:

| Concept | Question | Range |
| --- | --- | ---: |
| Parse | How strong was this kill? | 0–100 |
| Mastery | What repeatable performance does the observed record suggest? | 0–100 |
| Confidence | How much evidence supports that estimate? | 0–100% |
| Ranked Mastery | What conservative value should a leaderboard compare? | 0–100 |
| Renown | How much breadth and repeated history has Chronicle witnessed? | unbounded career points |

A player with one locked 100 parse therefore keeps a **100 Mastery estimate**, but has only **22.1% Confidence** and **65.0 Ranked Mastery**. The player is not described as mediocre; the leaderboard is merely honest about uncertainty.

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
- `P_b`: Peak, the highest eligible locked parse.
- `F_b`: Form, the recency-weighted median parse.
- `Q_b`: Floor, the recency-weighted 25th percentile parse.
- `n_b`: number of eligible canonical kills.
- `M_b`: boss Mastery estimate.
- `C_b`: boss Confidence.
- `E_b`: evidence multiplier used for ranking.
- `R_b`: boss Ranked Mastery.

All calculations are partitioned by tenant/server, rating-policy version, exact scoring-period boundaries, instance, encounter, difficulty, raid size, metric, role where applicable, class, specialization, and sub-specialization where applicable. Current `parse_score_results` rows do not contain every provenance field directly; production computation must join the authoritative `parse_score_receipts` metadata or persist an equivalent rating-specific source projection.

## Eligible kills

A kill contributes once when all of these are true:

1. It has a successful locked parse result.
2. Its logical run is canonical under `ranking_runs`.
3. The instance and encounter are eligible in the rating policy.
4. The log is listed, valid, and allowed in the tenant's ranking cohort.
5. Its metric, difficulty, raid size, class, spec, and sub-spec match the rating partition.

Duplicate uploads must not create duplicate evidence. Reparse, invalidation, deletion, unlisting, or representative-run changes must rebuild affected summaries.

## 1. Recency weights

Form and Floor emphasize recent evidence while retaining older evidence.

Default half-life:

```text
H = 42 days
```

For a kill that is `d_i` days older than the most recent eligible kill in the selected scoring period:

```text
w_i = 2 ^ (-d_i / H)
```

The most recent kill has weight `1`. A kill 42 days older has weight `0.5`; a kill 84 days older has weight `0.25`.

Age is measured relative to the most recent eligible kill inside the exact selected scoring-period boundaries, not wall-clock time. A player does not become worse merely by taking a break. Freshness may be displayed separately. The period start, period end/cutoff, and latest-observation timestamp must be persisted as rating provenance because changing the selected period can change the eligible observations and weights.

### Weighted quantile algorithm

To compute a weighted quantile at probability `q`:

1. Sort observations by parse ascending.
2. Sum all weights as `W`.
3. Walk the sorted observations until cumulative weight is at least `q * W`.
4. Return that observation's parse.

The first version does not interpolate between observations. Deterministic tie-breaking is parse, timestamp, then result ID.

## 2. Peak, Form, and Floor

For each boss:

```text
Peak  P_b = max(p_i)
Form  F_b = weighted_quantile(p_i, w_i, 0.50)
Floor Q_b = weighted_quantile(p_i, w_i, 0.25)
```

Interpretation:

- **Peak** preserves demonstrated ceiling.
- **Form** carries most of the rating and describes typical recent play.
- **Floor** rewards a strong bad night and distinguishes consistent players from volatile players.

## 3. Boss Mastery estimate

The proposed initial blend is:

```text
M_b = 0.30 * P_b + 0.50 * F_b + 0.20 * Q_b
```

The weights sum to one, so Mastery remains on the locked parse scale from 0 through 100.

This is the number labeled **Mastery** in the UI. Confidence never changes it.

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

Confidence never reaches exactly 100%. Additional kills remain evidence, but have very small rating effects after the curve saturates.

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

First convert Confidence into an evidence multiplier:

```text
E_b = 0.55 + 0.45 * C_b
```

Then:

```text
R_b = M_b * E_b
```

The `0.55` prior floor means one real result is meaningful, but cannot immediately produce an established leaderboard score. It is a policy constant and must be versioned.

The maximum Ranked Mastery possible at kill count `n` is:

```text
RankedCeiling(n) = 100 * (0.55 + 0.45 * (1 - exp(-n / 4)))
```

| Kills | Ranked ceiling for a 100 Mastery estimate |
| ---: | ---: |
| 1 | 65.0 |
| 2 | 72.7 |
| 3 | 78.7 |
| 5 | 87.1 |
| 8 | 93.9 |
| 14 | 98.6 |
| 20 | 99.7 |

The UI must show Mastery, Confidence, and Ranked Mastery together. It must not label Ranked Mastery simply as Mastery.

## 6. Instance and portfolio scopes

The same model can be viewed at three levels:

1. **Boss:** one encounter.
2. **Instance:** only eligible bosses in Molten Core, Zul'Gurub, and so on.
3. **Portfolio:** all instances selected by a versioned rating policy.

### Production aggregation

Calculate boss values first. For a scope with eligible boss weights `a_b`:

```text
ScopeMastery = sum(a_b * M_b for observed bosses)
             / sum(a_b for observed bosses)
```

Initial boss weights are all `1`. Boss-specific weights are deliberately deferred.

Scope evidence includes missing eligible bosses as zero confidence:

```text
ScopeConfidence = sum(a_b * C_b for every eligible boss)
                / sum(a_b for every eligible boss)
```

This means one excellent boss does not look like complete instance mastery. Missing bosses reduce confidence rather than pretending the player performed badly.

```text
ScopeEvidenceMultiplier = 0.55 + 0.45 * ScopeConfidence
ScopeRankedMastery = ScopeMastery * ScopeEvidenceMultiplier
```

If no boss has an eligible parse, Scope Mastery is absent rather than zero.

### Prototype simplification

The current Storybook uses aggregate Peak/Form/Floor values and average kills per observed boss. Production must calculate per-boss values first using the equations above. Weighted quantiles and nonlinear evidence/Renown curves do not commute with averaging, so the Storybook numbers are illustrative rather than production-equivalent. The primary display labels this as a prototype approximation.

### Adding new raids

A portfolio policy contains an immutable list of eligible instances and bosses. Adding a raid creates a new policy version or scoring period. It must not silently alter frozen historical standings.

Instance Mastery remains directly comparable because it is always normalized to 0–100. Renown may grow as the content catalog grows.

## 7. Prediction tooling

### Identical-performance prediction

If future kills follow the current Peak/Form/Floor profile, Mastery remains unchanged and only confidence changes:

```text
ProjectedConfidence(n + k) = 1 - exp(-(n + k) / 4)
ProjectedRankedMastery = Mastery * (0.55 + 0.45 * ProjectedConfidence)
```

This prediction answers: “What would repeating this level of play prove?”

### Next-parse simulation

For an entered next parse `x` at timestamp `t`:

1. Append `(x, t)` to the eligible kill set.
2. Recompute recency weights.
3. Recompute Peak, weighted Form, and weighted Floor.
4. Recompute Mastery, Confidence, and Ranked Mastery.
5. Display before/after values and explain which component changed.

This answers: “What happens if my next parse is 85?”

The simulator must be labeled hypothetical and must never write production scores.

## 8. Worked examples

The following examples use curated OctoWoW/N'Zoth production-derived summaries from the 180 days ending October 31, 2026. They explain the formula; they are not published ratings.

### Example A: one perfect kill

Inputs:

```text
Peak = 100
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
E = 0.55 + 0.45(0.2212) = 0.6495
R = 100.0 * 0.6495 = 65.0
```

Display:

```text
Mastery:        100.0
Confidence:      22.1% — Unproven
Ranked Mastery:  65.0
```

### Example B: Port in Molten Core

Prototype aggregate inputs:

```text
Peak = 100.0
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
E = 0.55 + 0.45(0.9698) = 0.9864
R = 93.42 * 0.9864 = 92.15
```

Display:

```text
Mastery:         93.4
Confidence:      97.0% — Established
Ranked Mastery:  92.2
```

### Example C: high peak, volatile record

Prototype Zul'Gurub aggregate:

```text
Peak = 99.1
Form = 62.9
Floor = 37.9
Average kills per boss = 6
```

```text
M = 0.30(99.1) + 0.50(62.9) + 0.20(37.9)
M = 29.73 + 31.45 + 7.58
M = 68.76

C = 1 - exp(-6 / 4) = 0.7769
E = 0.55 + 0.45(0.7769) = 0.8996
R = 68.76 * 0.8996 = 61.86
```

The 99.1 Peak remains visible, but the Form and Floor correctly prevent it from defining the player's expected performance.

## 9. Renown

Renown is a separate career ledger. It contains no parse, Mastery, or Ranked Mastery term.

For each eligible boss with `n_b` canonical kills:

```text
BossRenown(n_b) = 0                                      when n_b = 0
BossRenown(n_b) = 50 + 50 * (1 - exp(-(n_b - 1) / 6))  when n_b >= 1
```

Properties:

- The first witnessed kill awards 50 Renown.
- Repetition adds up to another 50 with diminishing returns.
- Each boss is therefore bounded below 100 Renown for repetition.
- Farming one boss forever cannot dominate breadth.

A complete eligible instance awards:

```text
InstanceCompletionBonus = 250
```

An instance is complete only when one canonical logical run contains a qualifying kill for every encounter in that policy version's eligible boss manifest. Combining bosses from unrelated partial runs does not award the completion bonus.

Total:

```text
Renown = sum(BossRenown(n_b))
        + 250 * completed_instances
        + explicit_versioned_milestone_awards
```

Milestone awards are zero in v1. If added later, every award type and value must be explicit in the policy.

Suggested presentation titles:

| Renown | Title |
| ---: | --- |
| 0–499 | Known |
| 500–1,499 | Respected |
| 1,500–2,999 | Celebrated |
| 3,000–4,999 | Exalted |
| 5,000+ | Legendary |

Titles are presentation only and may be retuned without changing stored Renown if title-versioning is preserved.

### Renown examples

Using the prototype's average-kills approximation:

| Player profile | Kills | Bosses | Completed raids | Approx. Renown |
| --- | ---: | ---: | ---: | ---: |
| one perfect flash | 1 | 1 | 0 | 50 |
| Port sample | 247 | 30 | 3 | 3,301 |
| Lebron sample | 360 | 31 | 4 | 3,836 |
| Jinocide sample | 211 | 31 | 4 | 3,511 |

The lower-Mastery player can have high Renown because Chronicle has witnessed a broad career. That separation is intentional.

## 10. Persistence and versioning

Recommended persisted summary key:

```text
policy_version
season_id
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

Recommended summary fields:

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

Live standings are provisional. A frozen scoring period stores immutable final summaries and policy metadata.

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

Then rebuild affected instance and portfolio summaries. A periodic reconciliation job should repair drift.

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

## 13. Open decisions

The formulas above are the proposed v1 policy. Before backend implementation, decide:

1. Whether Form should use weighted median or weighted mean.
2. Whether the half-life should be 42, 56, or another number of days.
3. Whether progression periods and farm periods should be separate policies.
4. Whether healers need role-specific components beyond HPS parse.
5. Whether encounter weights should all remain equal.
6. Whether portfolio confidence should include every historical raid or only the active policy manifest.
7. Whether Renown should reset by season, remain career-wide, or expose both.
8. Whether confidence labels are global or localized per game/server.

Any change to numerical scoring semantics requires a new policy version and recomputation rather than silently changing historical meaning.
