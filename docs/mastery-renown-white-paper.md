# Beyond the best parse: a Chronicle rating proposal

> **Design rationale.** The backend rating policy in #1516 is configurable; worked Storybook examples below are illustrative, not production ratings. Start here for the case and the questions. See the [research on other log sites](log-sites-question-research.md) for the external comparison, and the [mathematical specification](mastery-renown-rating.md) for candidate formulas and implementation constraints.

## The 30-second version

A parse tells us about **one kill**. A best parse tells us a player's **ceiling**. Neither describes repeatable results, how much evidence supports them, or how many eligible kills Chronicle has witnessed.

We propose two complementary ideas:

- **Mastery** describes the performance a player's recorded kills suggest they can repeat. Show the estimate **alongside Confidence**, not as a fact about the player's innate skill.
- **Renown** celebrates the breadth and repetition of a witnessed raiding career. It is not a skill rating.

A conservative **Ranked Mastery** could be used for competitive comparisons when the evidence is thin. A single perfect parse can say “Mastery estimate: 100” while saying “Confidence: low; Ranked Mastery: 65.” The numbers are *illustrative policy choices*, not product commitments.

**Pitch:** honor the exceptional moment without mistaking it for a proven pattern.

## The questions we are actually trying to answer

| Player question | What the answer should mean | Candidate evidence |
| --- | --- | --- |
| **How good was that kill?** | An observation, not a player rating. | The persisted Chronicle parse for that kill. |
| **How good can this character be?** | Demonstrated ceiling, without a promise of repetition. | Best eligible raw DPS/HPS versus rank one, with best locked parse used separately in Mastery. |
| **What should we expect next time?** | A qualified estimate of typical recent performance in comparable content. | Distribution of eligible parses, with recent kills emphasized. |
| **How predictable is that expectation?** | Whether weaker nights remain strong, rather than whether a great night happened once. | Lower end of the observed parse distribution. |
| **How much should we trust the estimate?** | Evidence quantity and coverage, not a judgment about the person. | Canonical kills, distinct bosses, eligible scope, and sample size. |
| **How do we compare two players fairly?** | A conservative comparison that does not let a single great kill dominate a leaderboard. | Mastery together with explicit confidence adjustment; show both. |
| **What has this character accomplished?** | A witnessed history of eligible boss kills. | Canonical per-boss kills, with configured points and designated final-boss bonuses. |

These are different questions. **We should not force them all into one number.** Keep these answers distinct on profiles and leaderboards; none measures a person's overall skill.

## One foundation, two subjects: players and guilds

Locked per-boss observations are the foundation for Mastery, but player and guild inputs differ. Player Peak compares raw DPS/HPS, while guild Peak compares clean per-boss kill times. Guild Mastery uses locked boss-time parses. Both can earn Renown for eligible canonical kills. That gives us a useful test for every proposed measure: “What does the analogous question mean for a raid team?”

| Player question | Guild analogue |
| --- | --- |
| Can this character repeat a strong boss performance? | Can this roster repeatedly deliver strong boss performances together? |
| How much evidence supports their Mastery? | Across how many eligible clears, encounters, and roster configurations have we seen that performance? |
| How broad is this character's witnessed career? | What content has this guild completed, and how consistently has it returned? |

**Reusable building block does not imply identical aggregation.** Guild ratings use their own locked boss-time observations rather than averaging members' Mastery. The backend policy selects eligible content; guild Peak compares clean per-boss kill times with the tenant-wide fastest kill.

## Why a best-parse list is not enough

Imagine two players with the same best parse of 100 on a boss:

| | Player A | Player B |
| --- | --- | --- |
| Recorded parses | `100` | `86, 89, 91, 92, 94, 100` |
| What we know | A remarkable kill occurred. | Excellent play recurred across several kills. |
| What we **do not** know | Whether the 100 is repeatable. | Whether future performance will always match the best. |

Both deserve credit for a 100. The second record supports a stronger *expectation*; the first needs an uncertainty label rather than a claim that the player is weak. Conversely, a player with one high outlier and many low parses should not look equivalent to a player who performs well every week.

## Our proposed vocabulary

1. **Parse** — the persisted score for one kill, measured relative to the comparison cohort and window available when Chronicle scored it. The score result persists; the historical cohort is not an immutable snapshot.
2. **Peak** — the best raw DPS/HPS for a player, or fastest eligible boss time for a guild, compared with tenant-wide rank one. The best locked parse is a separate Mastery ingredient.
3. **Mastery estimate** — the pattern suggested by the best locked parse, typical recent play (**Form**), and the lower end of play (**Floor**). Normalized to the parse scale.
4. **Confidence** — how much eligible evidence supports that estimate. A separate property, not a rewrite of the observed parses.
5. **Ranked Mastery** — a cautious, confidence-adjusted number **if** we need a single leaderboard ordering. Always show the underlying estimate and confidence next to it.
6. **Renown** — a separately earned record of witnessed breadth and repetition. It can grow over a career; it does not mean “better player.”

A player's profile might read:

```text
Molten Core · Enhancement · DPS
Mastery estimate       93.4    What the performances suggest
Confidence             97%     About 14 eligible kills per observed boss
Ranked Mastery         93.4    Conservative comparison value
Peak                   100     Illustrative raw-performance fixture
Renown                3,301    Illustrative fixture, not configured production points
```

The displayed values above come from an exploratory Octo-derived Storybook example; they are not published player ratings. Portfolio Renown is **not** Molten Core-only Renown.

## The math, in plain English

The backend Mastery method has four steps. The [specification](mastery-renown-rating.md) defines the configurable policy equations and eligibility rules.

1. **Start with eligible locked parse results.** Count a logical kill only once; compare like with like (server, metric, spec, difficulty, raid size, scoring period). Do not mistake duplicate uploads for extra experience.
2. **Summarize each boss separately.** The best locked parse is retained. Starting at five kills, Form and Floor exclude the lowest 20% (rounded down), then favor recent retained kills. Excluded kills still count toward evidence.
3. **Estimate Mastery.** The example blend gives Form the most weight, then best locked parse, then Floor. This remains on a 0–100 scale; a player can have high Mastery after one kill, but the estimate is uncertain.
4. **Express uncertainty explicitly.** Confidence describes how much eligible evidence we have. In the current prototype, the separate Ranked Mastery discount ends at five kills per boss; Confidence can keep growing. Missing eligible bosses count as zero in the fixed-denominator raid and group competitive score, not as zero-valued parse observations.

For the illustrative 30/50/20, 65%-to-100% policy:

```text
Mastery estimate = 30% best locked parse + 50% Form + 20% Floor
Confidence       = 1 - exp(-eligible kills / 4)
Ranking weight   = 65% at one kill, then +8.75% per kill through five
Ranked Mastery   = Mastery estimate × Ranking weight
```

A perfect parse with one eligible kill therefore means **100 Mastery estimate, 22% Confidence, 65 Ranked Mastery**. Five equally strong kills mean **100 Mastery estimate, 71% Confidence, 100 Ranked Mastery**. Confidence keeps describing evidence after the provisional ranking discount ends. The underlying observed parse does not get smaller; only the conservative comparison changes.

The numerical policy is configurable by rating group. Validate real player and guild histories before launch rather than treating these example coefficients as universal defaults.

### Why not lead with LaTeX?

Equations are useful for precision, but they should **confirm** an idea the reader already understands—not serve as the entry point. Keep the pitch and examples in ordinary language; keep exact formulas, notation, quantile definitions, edge cases, and versioning in the linked technical specification. If this becomes a published PDF, typeset that appendix with LaTeX or another math renderer. For the GitHub review loop, Markdown and short text equations are easier to diff, comment on, and skim.

## Scope: boss, instance, or portfolio

The same question should be answerable for a boss, **one selected raid such as Molten Core**, or a fixed set of raids. Never make a player read a lifetime total just to understand their Molten Core performance.

- **Boss:** the player's recorded performances on one eligible encounter.
- **Instance:** combine the boss-level results for that raid. Show boss coverage and confidence.
- **Portfolio:** combine an explicitly versioned set of raids. Adding a raid creates a new version rather than silently changing yesterday's rating.

A raid or group rating uses a fixed eligible manifest; missing boss and raid scores count as zero in its weighted average. Changing eligible content creates a new policy revision. Renown can grow when the character actually records more eligible history. Their different behavior is intentional.

## What these ratings must **not** claim

- A parse or Mastery measures every aspect of raid contribution, teamwork, or skill.
- A low-confidence estimate means a player is bad.
- A high Renown means a player is strong.
- Inactivity alone decays recency weights: older kills weigh less *relative to newer kills*, while rolling-window expiry and freshness are separate effects.
- Scores from different specs, roles, servers, or rule periods are interchangeable without an explicit policy.
- The Storybook's aggregate examples are production-equivalent: production must calculate per boss and exclude low observations before aggregating.

## Implemented direction and launch checks

**Distinct promises:** Renown records eligible kills, Mastery describes repeatable locked-parse results, Peak compares a raw best against the current rank one, and Ranked Mastery is a conservative competitive score. Player and guild ratings share these concepts but use different raw inputs. Full-clear Speedruns and existing Performance scores remain separate.

**Cohort and scope:** Rank-one comparisons are tenant/server-wide, not restricted to the realm group. Realm groups select the policy and eligible boss manifest. Missing eligible bosses contribute zero to fixed-denominator raid and group competitive averages. Period length, recency half-life, weights, and boss Renown awards are admin-configurable; 180 days and 42 days are example policy values, not inherent constants.

**Renown and deletion:** Each eligible canonical boss kill earns configured points, with an optional configured final-boss bonus on that kill. There is no full-clear bonus or diminishing-return curve. Renown has career and period views. Deleting the final source log removes its credit; a surviving duplicate source retains credit. Daily bounded repair fills missing historical facts, and a subsequent complete daily rating rebuild publishes them.

**QA before launch:** Exercise low-evidence and sparse cohorts, partial raids, a very strong single kill versus repeatable results, lowest-fifth exclusion, a guild-less fastest kill, duplicate uploads, deletion/re-upload, and realm-group changes against actual configured policies. Storybook fixtures do not establish production rankings.

## How to read further

- **One minute:** read the 30-second version and the questions table.
- **Five minutes:** add the examples, vocabulary, and decision gate.
- **Technical review:** read the [full math and implementation specification](mastery-renown-rating.md), including provenance, worked examples, and unresolved choices.
