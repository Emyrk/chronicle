# Tank role inference

Chronicle infers encounter tank roles from incoming hostile Auto Attack attempts.
The algorithm intentionally does not use class, specialization, talents, stance,
form, or total damage taken.

## Goals

- Use one global threshold in Go and TypeScript.
- Ignore raid-wide spell damage by construction.
- Detect main tanks and tanks assigned to separate hostile sources.
- Count avoided and zero-damage attacks as evidence.
- Keep leaderboard parsing and the interactive Roles panel behavior identical.
- Preserve enough evidence in the Roles panel to debug real instances.

## Packages

| Runtime | Package | Responsibility |
|---|---|---|
| Go | `internal/roleinfer` | Pure scoring and classification used by leaderboard parsing |
| TypeScript | `EventsPanels/Roles/tankInference.ts` | Matching pure scoring and classification |
| Go parser | `rankings.DPSTracker` | Extract source/player Auto Attack attempt counts before damage filtering |
| TypeScript worker | `Roles/tankAttempts.processor.ts` | Extract matching counts from the damage event stream |
| Shared tests | `testdata/roleinfer/cases.json` | Language-neutral parity cases loaded by Go and TypeScript tests |

Both packages expose these versioned constants:

```text
AlgorithmVersion = 2
TankThreshold = 0.4
EvidenceAttempts = 5
```

`TankThreshold` is the single global classification threshold.
`EvidenceAttempts` is a fixed smoothing term in the versioned formula, not an
encounter-specific cutoff.

## Algorithm

For each encounter and hostile source:

1. Count Auto Attack attempts directed at each player.
2. Include hits, crits, blocks, misses, dodges, parries, absorbs, and other
   zero-damage outcomes when represented as Auto Attacks.
3. Find the largest player attempt count for that source.
4. Score every attacked player:

```text
sourceScore = playerAttempts / (maxAttempts + EvidenceAttempts)
```

Within each encounter, each player keeps only their strongest source score. This
prevents encounters with many adds from receiving more weight than a single-boss
encounter. Across selected encounters:

```text
cumulativeScore = sum(best sourceScore in each encounter)
persistenceScore = cumulativeScore / highest player cumulativeScore
tankScore = min(strongestSourceScore, persistenceScore)
isTank = tankScore >= TankThreshold
```

The strength term requires credible Auto Attack evidence; the persistence term
requires the behavior to recur across the selected range. For a single selected
encounter, the strongest player has a persistence score of `1`, so the result is
driven by the source score as before.

Boss leaderboard rows are encounter-specific. Trash ranking rows preserve
encounter boundaries and apply the same persistence calculation across included
trash encounters.

### Example

A boss attacks one player 20 times and another player twice:

```text
tank = 20 / (20 + 5) = 0.80  -> tank
dps  =  2 / (20 + 5) = 0.08  -> not tank
```

Four attempts from the primary target clear the global threshold:

```text
4 / (4 + 5) = 0.44 -> tank
```

Fewer than four attempts cannot cross the threshold in algorithm version 2.

## Data flow

```mermaid
flowchart TD
    A["Combat log damage event"] --> B{"Auto Attack?"}
    B -->|No| C["Ignore for tank inference"]
    B -->|Yes| D{"NPC source to player target?"}
    D -->|No| C
    D -->|Yes| E["Count encounter / source / player attempt"]
    E --> F["Compute max attempts per source"]
    F --> G["Keep best source score per player / encounter"]
    G --> H["Combine strength with cross-encounter persistence"]
    H --> K{"Score >= 0.4?"}
    K -->|Yes| I["Tank"]
    K -->|No| J["Continue healer or DPS inference"]
```

```mermaid
flowchart TD
    A["Shared fixture corpus"] --> B["Go roleinfer tests"]
    A --> C["TypeScript tankInference tests"]
    D["Parsed server events"] --> E["Go DPSTracker"]
    E --> F["Leaderboard role"]
    G["Instance damage stream"] --> H["TypeScript worker processor"]
    H --> I["Roles panel role and evidence"]
```

## Auto Attack identification

Go accepts messages whose spell data identifies spell ID `6603`. It also has a
fallback for legacy swing messages without spell data.

TypeScript accepts damage events when either:

- `spellId === 6603`, or
- `sourceName === "Auto Attack"`.

The source must not be a player or player-owned unit. The target must be a
player. Generic physical spell damage, Cleave, and raid-wide AoE do not enter
the tank scorer.

## Roles panel debugging

Open the Roles panel and expand **Detection thresholds**, then **Tank evidence**.
The table is sorted by score and shows:

- Player
- Final tank score
- Strongest-source score
- Cross-encounter persistence score
- Strongest hostile source
- Player attempts versus that source's maximum
- Final tank classification

For several selected encounters, the table shows both the strongest isolated
evidence and whether that evidence persists across the selected range.

## Fetching real instances

Use `scripts/fetch-fixtures/fetch-fixtures.sh` to fetch instance metadata and
binary event streams by slug or full Chronicle URL. Fetched data is written to
a gitignored directory.

```bash
./scripts/fetch-fixtures/fetch-fixtures.sh INSTANCE_SLUG
./scripts/fetch-fixtures/fetch-fixtures.sh -f instance-slugs.txt
./scripts/fetch-fixtures/fetch-fixtures.sh -b http://localhost:4000 INSTANCE_SLUG
```

See `scripts/fetch-fixtures/README.md` for all options and the local data layout.
The same slug can be opened in the site to inspect the Roles evidence table:

```text
/instances/{slug}?panels=roles
```

The fetch tool is intended for exploratory analysis. Promote only small,
purpose-built cases into `testdata/roleinfer/cases.json`. Never commit fetched
live instance data, which may contain player names and combat details.

## Changing the algorithm

Any formula, threshold, smoothing, aggregation, or event-identification change
must:

1. Increment `AlgorithmVersion` in both packages.
2. Update the constants in both packages.
3. Update the shared fixture corpus.
4. Pass Go and TypeScript parity tests.
5. Be validated against representative live instances before reparsing or
   changing historical leaderboard data.

## Known limitations

- Caster enemies that never perform Auto Attacks may provide no tank evidence.
- An isolated pull can still classify a player when that encounter alone is
  selected; persistence only applies when several encounters are selected.
- Relative persistence identifies recurring tanks but can suppress a legitimate
  tank who participates in fewer than roughly 40% as much evidence as the most
  active tank in the selected range.
- The threshold is global and visible, but should continue to be validated with
  labeled real instances before broad historical reparsing.
