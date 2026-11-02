# What questions do combat-log sites answer?

Research notes for the [Mastery and Renown pitch](mastery-renown-white-paper.md). **Evidence status:** primary public API documentation and two staff replies on the Combat Log Forums were accessible; WCL/FF Logs/ESO Logs help pages returned human-verification gates. The full deep-research verification workflow failed before synthesis, so these notes make only claims independently checked against the linked sources. No exact All Star formula is claimed here.

## One-minute takeaway

Existing log sites answer **different questions with different lenses**. Their best rankings and All Stars celebrate exceptional results; their parse comparisons can describe how a result stands against a more representative set of recent performances. Guild rankings answer *when the team cleared and how fast*; a separate fight-execution metric asks how cleanly a fight was won. None of these, by itself, claims to estimate a player's repeatable performance or the certainty of that estimate.

| Question | Existing lens | What it does **not** establish |
| --- | --- | --- |
| How did this kill compare? | Encounter/report ranking, scoped by metric, role/spec, difficulty, size, bracket and partition. [Character API][character] | A complete assessment of player or team skill. |
| What is my best demonstrated result? | Rankings compare against the **best scores across a tier**. [Character API][character] | Typical performance or consistency. |
| How did I fare against normal recent activity? | Parse comparison uses **all parses in a two-week window**; the API calls it more representative of real-world performance. [Character API][character] [Comparison enum][compare] | A confidence-calibrated expectation for the next kill. |
| How competitive is my body of best results in a raid? | Zone/partition All Stars, with rank-one-relative scoring per staff explanation. [Partition API][partition] [Staff explanation][allstars] | A lifetime score, or necessarily a measure of typical play. |
| What has the raid team achieved? | Guild progress, all-star-based speed, and complete-raid speed are separate ranks. [Guild rankings API][guildranks] | The average skill of its roster. |
| How efficiently or cleanly was a fight won? | Fight metrics include speed, progress, and execution; execution rewards fewer deaths and less damage taken. [Fight metrics API][fightmetrics] | How strong a member would be in a different team. |

## What All Stars is *for*

**Documented behavior:** partitions belong to a particular raid zone and contain their own rankings, statistics, and All Stars. A WCL forum staff member explains that All Star Points are **relative to rank 1**, are **summarized from one partition**, and that an “All” view can display best boss parses from multiple partitions even when the overall ASP total comes from just one. The same staff discussion says ASP is computed once a day. [Partition API][partition] [Staff explanation][allstars]

**Reasonable interpretation, not an official mission statement:** All Stars is a *within-zone, within-partition competitive scorecard of best performances*. It answers “How strong is this character's collection of best boss results here?” better than it answers “What should I expect on the next pull?” It can reward both breadth of boss coverage and proximity to the top, but the exact weighting and boss eligibility must be verified for the specific game's ruleset before copying it.

**Important caveat:** A 2019 reply from WCL's Kihra describes a then-current top-10,000-per-spec computational cutoff that could make actual total All Stars differ from displayed per-boss estimates. That is evidence about **2019 behavior**, not proof the cutoff remains in effect today. [Historical cutoff reply][cutoff]

Because a zone and partition define the scorecard, don't present ASP as a single ever-growing career balance. The API even distinguishes a zone that is permanently frozen from one whose ranking data may change. [Zone API][zone] [Character API][character]

## What the comparison choice really changes

WCL/FF Logs API docs explicitly contrast **ranking against best scores across the entire tier** with **ranking against two weeks of parses**, describing the latter as “more representative of real-world performance.” That is the closest documented analogue to our “typical rather than peak” question. [Character API][character] [FF Logs character API][ffcharacter]

The API also offers comparison against **today's** rankings or **historical** rankings around the time of the fight, separate from the rankings-versus-parses choice. Those are distinct axes; a historical comparison is not, by itself, a consistency metric. [Character API][character] [Timeframe enum][timeframe]

**Do not conflate WCL/FF Logs ranking percentiles with Chronicle's parse scale.** Chronicle's persisted parse is a rank-one-relative score computed against the cohort and window at scoring time. It is a different observation even if both systems display a value from 0 to 100. A Chronicle Mastery formula must be defended against Chronicle's actual distribution, not justified by an FF Logs percentile label.

## Guilds are a first-class subject, not an average player

The public API says guilds earn their **own** rankings and may represent a guild or a raid team; it separately exposes guild attendance and team tags. The GuildZoneRankings API distinguishes **progress** (always highest difficulty), **all-star-based speed**, and **complete raid speed**, with raid size relevant to Classic. [Guild API][guild] [Guild rankings API][guildranks]

This supports a useful product separation:

- **Individual parse-derived ratings:** “How does this character tend to perform?”
- **Guild fight/raid outcomes:** “When and how fast did this team clear?”; fight-execution metrics separately address deaths and damage taken.
- **Possible guild parse-derived ratings:** “How consistently did this team deliver strong normalized performances together?” — a Chronicle proposal, **not** an established feature of the cited sites.

The same fundamental observations may inform player and guild products, but guild identity, changing rosters, fight outcomes, and eligibility require their own aggregation policy. Averaging members' Mastery is not a substitute for a team result.

## Incentives and limits worth testing

The first-party sources confirm that comparison cohorts, metrics, partitions, and rules vary. They **do not** establish that every site solves padding, favorable kill times, selective uploading, or small samples. The presence of special metrics is evidence that metric choice matters: WCL documents weighted DPS as removing pad damage and rewarding high-priority targets, and FF-specific raid-contribution metrics such as rDPS. [Player metrics API][playermetrics]

Questions to test with Chronicle data, rather than assert away:

1. Can one exceptional log or repeated farming of one favorable boss dominate the score?
2. Do missing bosses, low sample sizes, or private/unlisted logs change the apparent ranking?
3. Can gear, externals, encounter strategy, or kill duration confound a “player skill” interpretation?
4. Does a historical locked parse remain comparable to one scored under a later cohort and policy?
5. Does an instance/portfolio rating reward breadth, or merely access to more logged content?
6. For guilds, are we scoring a stable team, an organization with rotating rosters, or a single clear?

## Implications for the white paper

1. Lead with the **question** (“best?”, “typical?”, “confidence?”, “team outcome?”), not the metric name.
2. Describe All Stars as a **peak-oriented zone scorecard**, not a prospective skill estimate.
3. Explain that “two weeks of parses” is a *comparison population*, whereas Chronicle's proposed recency-weighted Mastery is an *aggregation of one subject's persisted parses*. They are not the same operation.
4. Keep guild questions explicit and distinct from averaging player scores.
5. Avoid exact All Star formulas, across-game equivalence, or current cutoff claims without accessible first-party documentation for the particular game and period.

[character]: https://www.warcraftlogs.com/v2-api-docs/warcraft/character.doc.html
[ffcharacter]: https://www.fflogs.com/v2-api-docs/ff/character.doc.html
[compare]: https://www.warcraftlogs.com/v2-api-docs/warcraft/rankingcomparetype.doc.html
[timeframe]: https://www.warcraftlogs.com/v2-api-docs/warcraft/rankingtimeframetype.doc.html
[partition]: https://www.warcraftlogs.com/v2-api-docs/warcraft/partition.doc.html
[allstars]: https://forums.combatlogforums.com/t/how-is-the-overall-raid-allstar-points-computed/14340
[cutoff]: https://forums.combatlogforums.com/t/all-star-point-totals-dont-match-per-boss-totals/7530
[zone]: https://www.warcraftlogs.com/v2-api-docs/warcraft/zone.doc.html
[guild]: https://www.warcraftlogs.com/v2-api-docs/warcraft/guild.doc.html
[guildranks]: https://www.warcraftlogs.com/v2-api-docs/warcraft/guildzonerankings.doc.html
[fightmetrics]: https://www.warcraftlogs.com/v2-api-docs/warcraft/fightrankingmetrictype.doc.html
[playermetrics]: https://www.warcraftlogs.com/v2-api-docs/warcraft/characterrankingmetrictype.doc.html
