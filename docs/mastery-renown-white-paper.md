# Beyond the best parse: Chronicle ratings

> **Design rationale.** The rating backend is on `main` with a fixed, versioned policy; worked Storybook examples below are illustrative, not production ratings. Start here for the case and the questions. See the [research on other log sites](log-sites-question-research.md) for the external comparison, and the [mathematical specification](mastery-renown-rating.md) for policy formulas and implementation constraints.

## The 30-second version

A parse tells us about **one kill**. A best parse tells us a player's **ceiling**. Neither describes repeatable results, how much evidence supports them, or how many eligible kills Chronicle has witnessed.

Chronicle uses two complementary ideas:

- **Mastery** describes the performance a player's recorded kills suggest they can repeat. Show the estimate **alongside Confidence**, not as a fact about the player's innate skill.
- **Renown** celebrates the breadth and repetition of a witnessed raiding career. It is not a skill rating.

A conservative **Ranked Mastery** supports competitive comparisons when the evidence is thin. A single perfect parse can say “Mastery estimate: 100” while saying “Confidence: low; Ranked Mastery: 50.”

**Pitch:** honor the exceptional moment without mistaking it for a proven pattern.

## The questions we are actually trying to answer

| Player question | What the answer should mean | Evidence |
| --- | --- | --- |
| **How good was that kill?** | An observation, not a player rating. | The persisted Chronicle parse for that kill. |
| **How good can this character be?** | Demonstrated ceiling, without a promise of repetition. | Best eligible raw DPS/HPS versus rank one, with best locked parse used separately in Mastery. |
| **What should we expect next time?** | A qualified estimate of typical recent performance in comparable content. | Distribution of eligible parses in the window. |
| **How predictable is that expectation?** | Whether weaker nights remain strong, rather than whether a great night happened once. | Lower end of the observed parse distribution. |
| **How much should we trust the estimate?** | Evidence quantity and coverage, not a judgment about the person. | Canonical kills, distinct bosses, eligible scope, and sample size. |
| **How do we compare two players fairly?** | A conservative comparison that does not let a single great kill dominate a leaderboard. | Mastery together with explicit confidence adjustment; show both. |
| **What has this character accomplished?** | A witnessed history of eligible boss kills. | Canonical per-boss kills, each worth that boss's points. |

These are different questions. **We should not force them all into one number.** Keep these answers distinct on profiles and leaderboards; none measures a person's overall skill.

## One foundation, two subjects: players and guilds

Locked per-boss observations are the foundation for Mastery, but player and guild inputs differ. Player Peak compares raw DPS/HPS, while guild Peak compares clean per-boss kill times. Guild Mastery uses locked boss-time parses. Both can earn Renown for eligible canonical kills. That gives us a useful test for every rating measure: “What does the analogous question mean for a raid team?”

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

## Rating vocabulary

1. **Parse** — the persisted score for one kill, measured relative to the comparison cohort and window available when Chronicle scored it. The score result persists; the historical cohort is not an immutable snapshot.
2. **Peak** — the best raw DPS/HPS for a player, or fastest eligible boss time for a guild, compared with tenant-wide rank one. The best locked parse is a separate Mastery ingredient.
3. **Mastery estimate** — the pattern suggested by the best locked parse, typical play (**Form**), and the lower end of play (**Floor**). Normalized to the parse scale.
4. **Confidence** — how much eligible evidence supports that estimate. A separate property, not a rewrite of the observed parses.
5. **Ranked Mastery** — a cautious, confidence-adjusted number **if** we need a single leaderboard ordering. Always show the underlying estimate and confidence next to it.
6. **Renown** — a separately earned record of witnessed breadth and repetition. It can grow over a career; it does not mean “better player.”

A player's profile might read:

```text
Molten Core · Enhancement · DPS
Mastery estimate       94.3    What the performances suggest
Confidence             97%     About 14 eligible kills per observed boss
Ranked Mastery         94.3    Conservative comparison value
Peak                   100     Illustrative raw-performance fixture
Renown                3,301    Illustrative fixture, not production points
```

The displayed values above come from an exploratory Octo-derived Storybook example; they are not published player ratings. Renown shown here is for Molten Core only.

## The math, in plain English

The backend Mastery method has four steps. The [specification](mastery-renown-rating.md) defines the policy equations and eligibility rules.

1. **Start with eligible locked parse results.** Count a logical kill only once; compare like with like (server, metric, spec, difficulty, raid size, scoring period). Do not mistake duplicate uploads for extra experience.
2. **Summarize each boss separately.** The best locked parse is retained. Starting at five kills, Form and Floor exclude the lowest 20% (rounded down); every retained kill counts equally. Excluded kills still count toward evidence.
3. **Estimate Mastery.** The example blend gives Form the most weight, then best locked parse, then Floor. This remains on a 0–100 scale; a player can have high Mastery after one kill, but the estimate is uncertain.
4. **Express uncertainty explicitly.** Confidence describes how much eligible evidence we have. The separate Ranked Mastery discount ends at five kills per boss; Confidence can keep growing. In a raid's Peak, a missed boss counts as zero, not as a zero-valued parse observation.

For the current 35/50/15, 50%-to-100% policy:

```text
Mastery estimate = 35% best locked parse + 50% Form + 15% Floor
Confidence       = 1 - exp(-eligible kills / 4)
Ranking weight   = 50% at one kill, then +12.5% per kill through five
Ranked Mastery   = Mastery estimate × Ranking weight
```

A perfect parse with one eligible kill therefore means **100 Mastery estimate, 22% Confidence, 50 Ranked Mastery**. Five equally strong kills mean **100 Mastery estimate, 71% Confidence, 100 Ranked Mastery**. Confidence keeps describing evidence after the provisional ranking discount ends. The underlying observed parse does not get smaller; only the conservative comparison changes.

The numerical policy is a fixed product rule, versioned and frozen into each rebuild. Validate real player and guild histories before launch; a change is a new version and a full rebuild.

### Why not lead with LaTeX?

Equations are useful for precision, but they should **confirm** an idea the reader already understands—not serve as the entry point. Keep the pitch and examples in ordinary language; keep exact formulas, notation, quantile definitions, edge cases, and versioning in the linked technical specification. If this becomes a published PDF, typeset that appendix with LaTeX or another math renderer. For the GitHub review loop, Markdown and short text equations are easier to diff, comment on, and skim.

## Scope: boss, raid, or chosen bosses

The same question should be answerable for a boss, **one raid such as Molten Core**, or a chosen set of its bosses. Never make a player read a lifetime total just to understand their Molten Core performance.

- **Boss:** the player's recorded performances on one eligible encounter.
- **Raid:** combine the boss-level results for that raid. Raid Peak averages every boss on the raid's roster, a missed boss counting as zero.
- **Chosen bosses:** the leaderboards average any set of a raid's bosses on request, a missed boss counting as zero, and sum Renown.

Renown can grow when the character actually records more eligible history; skill ratings stay on the 0–100 scale. Their different behavior is intentional.

## What these ratings must **not** claim

- A parse or Mastery measures every aspect of raid contribution, teamwork, or skill.
- A low-confidence estimate means a player is bad.
- A high Renown means a player is strong.
- Inactivity alone lowers a rating: kills only leave the 180-day view as it rolls forward, and the all-time view keeps them.
- Scores from different specs, roles, servers, or rule periods are interchangeable without an explicit policy.
- The Storybook's aggregate examples are production-equivalent: production must calculate per boss and exclude low observations before aggregating.

## Implemented direction and launch checks

**Distinct promises:** Renown records eligible kills, Mastery describes repeatable locked-parse results, Peak compares a raw best against the current rank one, and Ranked Mastery is a conservative competitive score. Player and guild ratings share these concepts but use different raw inputs. Full-clear Speedruns and existing Performance scores remain separate.

**Cohort and scope:** Rank-one comparisons are tenant/server-wide; realm filters only narrow who is listed. Each realm's game flavor selects its curated boss roster. Missed bosses count as zero in raid Peak. The 180-day period, weights, ranking curve, and boss Renown points are fixed product rules, versioned and frozen into each rebuild; no admin setting changes them.

**Renown and deletion:** Each eligible canonical boss kill earns that boss's points (for example, Ragnaros 5, Majordomo 2, most Molten Core bosses 1). There is no final-boss bonus, full-clear bonus, or diminishing-return curve. Renown has career and period views. Deleting the final source log removes its credit; a surviving duplicate source retains credit. Daily bounded repair fills missing historical facts, and a subsequent complete daily rating rebuild publishes them.

**QA before launch:** Exercise low-evidence and sparse cohorts, partial raids, a very strong single kill versus repeatable results, lowest-fifth exclusion, a guild-less fastest kill, duplicate uploads, and deletion/re-upload against published generations. Storybook fixtures do not establish production rankings.

## How to read further

- **One minute:** read the 30-second version and the questions table.
- **Five minutes:** add the examples, vocabulary, and decision gate.
- **Technical review:** read the [full math and implementation specification](mastery-renown-rating.md), including provenance, worked examples, and unresolved choices.
