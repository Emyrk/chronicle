# Beyond the best parse: a Chronicle rating proposal

> **Discussion draft, not an approved scoring policy.** Start here for the case and the questions. See the [mathematical specification](mastery-renown-rating.md) for the current candidate formulas, worked examples, and implementation constraints.

## The 30-second version

A parse tells us about **one kill**. A best parse tells us a player's **ceiling**. Neither tells us what they are likely to do next, how much evidence supports that expectation, or how broad a career Chronicle has actually seen.

We propose two complementary ideas:

- **Mastery** describes the performance a player's recorded kills suggest they can repeat. Show the estimate **alongside Confidence**, not as a fact about the player's innate skill.
- **Renown** celebrates the breadth and repetition of a witnessed raiding career. It is not a skill rating.

A conservative **Ranked Mastery** could be used for competitive comparisons when the evidence is thin. A single perfect parse can say “Mastery estimate: 100” while saying “Confidence: low; Ranked Mastery: 65.” The numbers are *illustrative policy choices*, not product commitments.

**Pitch:** honor the exceptional moment without mistaking it for a proven pattern.

## The questions we are actually trying to answer

| Player question | What the answer should mean | Candidate evidence |
| --- | --- | --- |
| **How good was that kill?** | An observation, not a player rating. | The persisted Chronicle parse for that kill. |
| **How good can this character be?** | Demonstrated ceiling, without a promise of repetition. | Best eligible parse on each boss. |
| **What should we expect next time?** | A qualified estimate of typical recent performance in comparable content. | Distribution of eligible parses, with recent kills emphasized. |
| **How predictable is that expectation?** | Whether weaker nights remain strong, rather than whether a great night happened once. | Lower end of the observed parse distribution. |
| **How much should we trust the estimate?** | Evidence quantity and coverage, not a judgment about the person. | Canonical kills, distinct bosses, eligible scope, and sample size. |
| **How do we compare two players fairly?** | A conservative comparison that does not let a single great kill dominate a leaderboard. | Mastery together with explicit confidence adjustment; show both. |
| **What has this character accomplished?** | A witnessed history of breadth, repetition, and completions. | Distinct bosses, repeated kills, complete raids, later explicit milestones. |

These are different questions. **We should not force them all into one number.** Before tuning coefficients, we should agree which answers belong on a profile, which belong on a leaderboard, and which should never be inferred from logs alone.

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
2. **Peak** — the best eligible parse; the answer to “how high have they reached?”
3. **Mastery estimate** — the pattern suggested by Peak, typical recent play (**Form**), and the lower end of play (**Floor**). Normalized to the parse scale.
4. **Confidence** — how much eligible evidence supports that estimate. A separate property, not a rewrite of the observed parses.
5. **Ranked Mastery** — a cautious, confidence-adjusted number **if** we need a single leaderboard ordering. Always show the underlying estimate and confidence next to it.
6. **Renown** — a separately earned record of witnessed breadth and repetition. It can grow over a career; it does not mean “better player.”

A player's profile might read:

```text
Molten Core · Enhancement · DPS
Mastery estimate       93.4    What the performances suggest
Confidence             97%     About 14 eligible kills per observed boss
Ranked Mastery         92.2    Conservative comparison value
Peak                   100     Best recorded moment
Renown                3,301    Career breadth and repetition across the portfolio
```

The displayed values above come from an exploratory Octo-derived Storybook example; they are not published player ratings. Portfolio Renown is **not** Molten Core-only Renown.

## The math, in plain English

The proposed method has four steps. The [specification](mastery-renown-rating.md) defines the precise candidate equations and eligibility rules.

1. **Start with eligible locked parse results.** Count a logical kill only once; compare like with like (server, metric, spec, difficulty, raid size, scoring period). Do not mistake duplicate uploads for extra experience.
2. **Summarize each boss separately.** Peak remembers the best parse. Form asks what has been typical, favoring recent kills. Floor asks what the weaker-but-not-worst nights look like.
3. **Estimate Mastery.** The current candidate gives Form the most weight, then Peak, then Floor. This remains on a 0–100 scale; a player can have high Mastery after one kill, but the estimate is uncertain.
4. **Express uncertainty explicitly.** Confidence rises quickly over the first few kills and then saturates. Ranked Mastery discounts the estimate when evidence is sparse. Missing eligible bosses reduce *scope confidence*, not the observed performance estimate.

For the current candidate only:

```text
Mastery estimate = 30% Peak + 50% Form + 20% Floor
Confidence       = 1 - exp(-eligible kills / 4)
Ranked Mastery   = Mastery estimate × (55% + 45% × Confidence)
```

A perfect parse with one eligible kill therefore means **100 Mastery estimate, 22% Confidence, 65 Ranked Mastery**. Fourteen equally strong kills mean **100 Mastery estimate, 97% Confidence, 98.6 Ranked Mastery**. The underlying observed parse does not get smaller; only the conservative comparison changes.

The coefficients are **hypotheses to test**, not numbers to defend for their own sake. Before shipping, calculate distributions on real eligible logs and test whether the outputs align with the questions above.

### Why not lead with LaTeX?

Equations are useful for precision, but they should **confirm** an idea the reader already understands—not serve as the entry point. Keep the pitch and examples in ordinary language; keep exact formulas, notation, quantile definitions, edge cases, and versioning in the linked technical specification. If this becomes a published PDF, typeset that appendix with LaTeX or another math renderer. For the GitHub review loop, Markdown and short text equations are easier to diff, comment on, and skim.

## Scope: boss, instance, or portfolio

The same question should be answerable for a boss, **one selected raid such as Molten Core**, or a fixed set of raids. Never make a player read a lifetime total just to understand their Molten Core performance.

- **Boss:** the player's recorded performances on one eligible encounter.
- **Instance:** combine the boss-level results for that raid. Show boss coverage and confidence.
- **Portfolio:** combine an explicitly versioned set of raids. Adding a raid creates a new version rather than silently changing yesterday's rating.

A normalized Mastery estimate does not automatically grow just because another raid exists. Renown can grow when the character actually records more eligible history. Their different behavior is intentional.

## What this proposal must **not** claim

- A parse or Mastery measures every aspect of raid contribution, teamwork, or skill.
- A low-confidence estimate means a player is bad.
- A high Renown means a player is strong.
- Inactivity alone makes a player worse: older kills weigh less *relative to newer kills*, while freshness should be shown separately.
- Scores from different specs, roles, servers, or rule periods are interchangeable without an explicit policy.
- The Storybook's aggregate examples are production-equivalent: production must calculate per boss before aggregating.

## The decision gate before implementation

We should first agree on these **product** answers, in this order:

1. **Primary use:** Is this principally a player-facing profile, a competitive leaderboard, a recruiting aid, or several explicitly different views?
2. **Promise:** Should Mastery mean an estimate of the *next kill*, the player's *recent typical play*, or their *body of work this period*? These need not yield the same formula.
3. **Scope and opportunity:** Which bosses count, and how do we treat missing bosses, new players, obsolete raids, and incomplete logs?
4. **Confidence policy:** How much should one kill count? Should low-evidence players be labeled provisional, ranked conservatively, or omitted from a leaderboard?
5. **Recency:** Do we want older performance to fade relative to newer performance? Should inactivity change only freshness, or leaderboard eligibility too?
6. **Renown identity:** Is Renown career-wide, seasonal, or both? Which milestones are truly worth recognizing?
7. **Fairness check:** Which real player histories would cause the proposed result to feel misleading? Identify those counterexamples before choosing weights.

Only then should we lock a v1 formula, run it against representative histories, inspect its failures, and version the policy. The interactive [Storybook field guide](../frontend/chronicle/src/pages/ArmoryPage/overview/MasteryRenown.stories.tsx) is a conversation aid, not a substitute for that decision.

## How to read further

- **One minute:** read the 30-second version and the questions table.
- **Five minutes:** add the examples, vocabulary, and decision gate.
- **Technical review:** read the [full math and implementation specification](mastery-renown-rating.md), including provenance, worked examples, and unresolved choices.
