# Chronicle DPS Summary View Spec

## Purpose

Design a default DPS summary view for Chronicle that is useful for raid leaders without overwhelming users with every possible boss, difficulty, raid-size, class, gear, and buff category.

The core product compromise:

```text
Default = broad, readable, useful
Advanced = precise, filterable, technical
```

Chronicle should show the raid leader the broad truth first, then allow power users to drill into exact encounter context.

---

## Product Principle

The most accurate DPS comparison is extremely specific:

```text
class/spec + boss + difficulty + raid size + phase/partition + gear band + buffs + kill duration
```

However, that is too fragmented for a good default UI.

The default DPS page should not behave like a raw statistics database. It should behave like a **raid-leader scan page**:

- fast to read
- clear about contribution
- neutral in tone
- honest about broad comparisons
- expandable into detailed boss views

Avoid making the default experience a parse-culture leaderboard. The first screen should help answer:

> What happened in this raid, who contributed damage, and where should leadership look deeper?

---

## View Hierarchy

Use three layers of specificity.

```text
1. General View
   “How did damage look overall?”

2. Context View
   “Was this good for this raid/boss type?”

3. Specific View
   “Show me Mage DPS on Lucifron with similar gear and similar conditions.”
```

The default should be layer 1. Layer 2 should be one click away. Layer 3 should live under advanced filters.

---

## Page Structure

```text
Raid Report
├─ Header
├─ Summary Cards
├─ Raid Damage Summary Table
│  └─ Expandable Player Rows
├─ Boss-by-Boss Encounter Summary
├─ Class Damage Profiles
└─ Advanced Filters / Exact Comparisons
```

---

## Header

Example layout:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Chronicle                                                                    │
│ Molten Core · Guild: <Guild Name> · May 24, 2026                              │
│ 40-player raid · 10 bosses · 2h 14m · Public report                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

Include:

- raid name
- guild name
- report date
- raid size if known
- boss count
- total duration
- visibility status

---

## DPS Summary Header

Example:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Raid Damage Summary                                                          │
│ Broad comparison view · Use boss details for exact encounter context          │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ All Damage ▼ ] [ Boss Damage ] [ Priority Damage ] [ Class View ] [ Advanced Filters ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Default Tabs / Toggles

Recommended top-level views:

1. **All Damage**
   - Familiar overall damage view.
   - Includes boss, adds, cleave, and other encounter damage.

2. **Boss Damage**
   - Reduces padding problems.
   - Best default for many raid-leader decisions.

3. **Priority Damage**
   - Damage to important adds, shields, or required targets.
   - Encounter-specific and may require boss rules.

4. **Class View**
   - Summarizes broad class-level patterns.
   - Not a tier list.

5. **Advanced Filters**
   - Exact boss/class/gear/buff/death comparisons.

---

## Summary Cards

Purpose: highlight what a raid leader should notice first.

Example:

```text
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│ Top Boss Damage    │ │ Highest Uptime      │ │ Most Priority Dmg   │ │ Death Impact        │
│ Tharok · Warrior   │ │ Brindle · Rogue     │ │ Ellaria · Mage      │ │ 7 early deaths      │
│ 548 boss DPS       │ │ 94% active time     │ │ 18.4% of add dmg    │ │ -8.2% raid uptime   │
└────────────────────┘ └────────────────────┘ └────────────────────┘ └────────────────────┘
```

### Suggested Cards

#### Top Boss Damage
Shows the player with the highest boss damage or boss DPS.

#### Highest Uptime
Shows the player with the highest active time among meaningful DPS participants.

#### Most Priority Damage
Shows who contributed most to important non-boss targets.

#### Death Impact
Summarizes deaths that materially affected raid output.

### Tone

Use neutral labels:

- “Strong boss damage”
- “High uptime”
- “Add-heavy damage profile”
- “Low uptime on this encounter”

Avoid judgmental labels:

- “Bad parse”
- “C-tier player”
- “Failed rotation”
- “Carried”

---

## Main Raid Damage Summary Table

This is the primary default view.

Example:

```text
Raid Damage Summary
Compared broadly against same class in this raid zone.

┌────┬───────────┬─────────┬────────────┬───────────┬──────────┬────────────┬──────────────┐
│ #  │ Player    │ Class   │ Total DPS  │ Boss DPS  │ Uptime   │ Gear Band  │ Summary      │
├────┼───────────┼─────────┼────────────┼───────────┼──────────┼────────────┼──────────────┤
│ 1  │ Tharok    │ Warrior │ 612        │ 548       │ 91%      │ High       │ Strong boss  │
│ 2  │ Ellaria   │ Mage    │ 585        │ 421       │ 88%      │ Typical    │ Add-heavy    │
│ 3  │ Brindle   │ Rogue   │ 552        │ 530       │ 94%      │ Typical    │ Consistent   │
│ 4  │ Caelwen   │ Hunter  │ 497        │ 455       │ 89%      │ Low        │ Strong/gear  │
│ 5  │ Morvain   │ Warlock │ 472        │ 390       │ 84%      │ Typical    │ Low uptime   │
└────┴───────────┴─────────┴────────────┴───────────┴──────────┴────────────┴──────────────┘
```

### Required Columns

| Column | Purpose |
|---|---|
| Rank | Simple scan order for selected metric |
| Player | Player name |
| Class | Class identity |
| Total DPS | Familiar headline DPS number |
| Boss DPS | Separates meaningful boss pressure from padding |
| Uptime | Explains output without shaming |
| Gear Band | Gives rough gear context |
| Summary | Short interpretation for leaders |

### Optional Columns

| Column | Purpose |
|---|---|
| Damage Share | Percent of raid damage contributed |
| Death Time | If/when the player died |
| Consumables | Basic investment signal |
| World Buffs | Important Vanilla/Turtle context |
| Confidence | Specificity/sample-size confidence for comparison |

---

## Row Summary Labels

Use short, neutral labels that explain the pattern.

Recommended labels:

| Label | Meaning |
|---|---|
| Strong boss | High boss damage relative to peers |
| Consistent | Stable across bosses / high uptime |
| Add-heavy | Total DPS inflated by adds or cleave |
| Strong/gear | Good result given gear band |
| Low uptime | Output limited by downtime |
| Death impacted | Death materially reduced contribution |
| Utility-heavy | Damage lower but utility contribution relevant |
| Needs review | Something unusual needs deeper inspection |

Avoid labels that imply blame unless the data is explicit and the UI can explain why.

---

## Expandable Player Row

Clicking a player row should open a deeper explanation.

Example:

```text
▼ Ellaria · Mage

Damage Profile
┌──────────────────────────────────────────────────────────────────────────────┐
│ Boss damage:        ████████████████████████░░░░  72%                        │
│ Priority add damage:███████░░░░░░░░░░░░░░░░░░░░   19%                        │
│ Padding / cleave:   ███░░░░░░░░░░░░░░░░░░░░░░░░    7%                        │
│ Trash:              █░░░░░░░░░░░░░░░░░░░░░░░░░░    2%                        │
└──────────────────────────────────────────────────────────────────────────────┘

Boss Breakdown
┌───────────────┬───────────┬───────────┬──────────┬────────────┬─────────────┐
│ Boss          │ Total DPS │ Boss DPS  │ Uptime   │ Result     │ Confidence  │
├───────────────┼───────────┼───────────┼──────────┼────────────┼─────────────┤
│ Lucifron      │ 604       │ 501       │ 92%      │ Strong     │ High        │
│ Magmadar      │ 488       │ 470       │ 87%      │ Typical    │ Medium      │
│ Gehennas      │ 691       │ 402       │ 89%      │ Add-heavy  │ Medium      │
│ Garr          │ 735       │ 318       │ 84%      │ Cleave     │ Low         │
│ Baron Geddon  │ 322       │ 309       │ 61%      │ Low uptime │ High        │
└───────────────┴───────────┴───────────┴──────────┴────────────┴─────────────┘

Notes
• Strong total damage, but much of the lead comes from add-heavy encounters.
• Boss damage is typical for a Mage in this raid.
• Baron Geddon damage was mostly limited by uptime, not obvious rotation failure.
```

### Expanded Row Sections

#### Damage Profile
Break damage into categories:

| Category | Meaning |
|---|---|
| Boss damage | Damage to boss targets |
| Priority add damage | Damage to adds that matter strategically |
| Padding / cleave | Damage that may inflate meters but may be less strategically relevant |
| Trash | Non-boss damage if included in selected view |

#### Boss Breakdown
Shows per-boss performance for that player.

#### Notes
Short generated insights. Keep them factual and neutral.

---

## Boss-by-Boss Encounter Summary

This section lets leaders scan all encounters without opening each boss page.

Example:

```text
Boss Damage by Encounter

┌───────────────┬───────────────┬───────────────┬──────────────┬───────────────┐
│ Boss          │ Top Damage    │ Strong Classes│ Risk Signal  │ Open Details  │
├───────────────┼───────────────┼───────────────┼──────────────┼───────────────┤
│ Lucifron      │ Tharok        │ Warrior/Rogue │ Clean        │ View →        │
│ Magmadar      │ Brindle       │ Rogue/Hunter  │ Fear uptime  │ View →        │
│ Gehennas      │ Ellaria       │ Mage/Warlock  │ Add padding  │ View →        │
│ Garr          │ Ellaria       │ Mage          │ Cleave-heavy │ View →        │
│ Baron Geddon  │ Tharok        │ Warrior       │ Low uptime   │ View →        │
│ Ragnaros      │ Brindle       │ Rogue/Warrior │ Death impact │ View →        │
└───────────────┴───────────────┴───────────────┴──────────────┴───────────────┘
```

### Columns

| Column | Purpose |
|---|---|
| Boss | Encounter name |
| Top Damage | Highest contributor for selected metric |
| Strong Classes | Classes that stood out on the encounter |
| Risk Signal | Important context or warning |
| Open Details | Link to full boss view |

### Risk Signals

Recommended examples:

- Clean
- Low uptime
- Death impact
- Add padding
- Cleave-heavy
- Threat-limited
- Movement-heavy
- Dispel/utility-heavy
- Small sample

---

## Class Damage Profiles

Do not present this as a strict tier list. Present it as a broad profile of how classes performed in this raid/report.

Example:

```text
Class Damage Profiles

┌─────────┬──────────────┬───────────────┬──────────────┬────────────────────┐
│ Class   │ Boss Damage  │ Total Damage  │ Consistency  │ Readout            │
├─────────┼──────────────┼───────────────┼──────────────┼────────────────────┤
│ Warrior │ Very strong  │ Strong        │ Medium       │ High boss pressure │
│ Rogue   │ Strong       │ Strong        │ High         │ Consistent uptime  │
│ Mage    │ Typical      │ Very strong   │ Medium       │ Add-heavy profile  │
│ Hunter  │ Typical      │ Typical       │ High         │ Stable ranged DPS  │
│ Warlock │ Low          │ Typical       │ Low          │ Uptime variance    │
└─────────┴──────────────┴───────────────┴──────────────┴────────────────────┘
```

### Class Profile Metrics

| Metric | Meaning |
|---|---|
| Boss Damage | How the class performed on boss targets |
| Total Damage | How the class performed on all encounter damage |
| Consistency | How stable class output was across bosses/players |
| Readout | Plain-language summary |

### Suggested Buckets

Use qualitative buckets rather than fake precision:

- Very strong
- Strong
- Typical
- Low
- Unclear

If sample size is weak, show **Unclear** instead of forcing a ranking.

---

## Comparison Specificity and Confidence

Chronicle should use broad comparisons by default and disclose when comparisons are broadened.

### Fallback Logic

```text
Best comparison:
same boss + same class + same raid size/difficulty + same gear band

If sample size is too low:
same boss + same class + same raid size/difficulty

If still too low:
same boss + same class

If still too low:
same raid zone + same class

If still too low:
same class across supported raids
```

### Confidence Labels

| Label | Meaning |
|---|---|
| High confidence | Specific comparison with enough samples |
| Medium confidence | Some filters broadened |
| Low confidence | Broad comparison; use cautiously |
| Insufficient data | Do not show comparison score |

### Disclosure Text

Use something like:

> This summary uses broad comparisons for readability. Open boss details for exact encounter-level context.

or:

> Some filters were broadened to preserve sample size.

---

## Gear Context

Item level should be shown as context, not as a perfect performance adjustment.

### Launch Version

Show:

- average item level if available
- gear band
- optional “strong for gear” label

Recommended gear bands:

```text
Low gear: bottom 25% of observed characters in context
Typical gear: middle 50%
High gear: top 25%
```

This adapts to available data and avoids hardcoded item-level ranges.

### Future Version

Add expected DPS by gear:

```text
Gear-adjusted DPS index = actual DPS / expected DPS for class + boss + item level
```

Display as:

- “+12% vs expected for gear”
- “Typical for gear”
- “Below expected for gear”

Avoid presenting gear-adjusted values as exact truth. In Vanilla/Turtle-style environments, item level can be misleading because of weapon skill, hit, crit, spell power, set bonuses, consumables, and world buffs.

---

## Advanced Filters

Advanced users should be able to access exact views without making the default page complex.

Example:

```text
Advanced Filters

[ Raid: Molten Core ▼ ]
[ Boss: All Bosses ▼ ]
[ Metric: Boss DPS ▼ ]
[ Class: All Classes ▼ ]
[ Gear Band: Any ▼ ]
[ World Buffs: Any ▼ ]
[ Deaths: Include ▼ ]
[ Comparison: Same class in raid zone ▼ ]

Comparison specificity:
Medium confidence
Some boss-specific categories are broadened to preserve sample size.
```

### Filter List

Recommended filters:

| Filter | Options |
|---|---|
| Raid | MC, Onyxia, etc. |
| Boss | All bosses or one boss |
| Metric | Total DPS, Boss DPS, Priority Damage, Uptime |
| Class | All or specific class |
| Gear Band | Any, Low, Typical, High |
| World Buffs | Any, With, Without |
| Consumables | Any, Used, Not used |
| Deaths | Include, Exclude, Death before X% |
| Comparison | Same boss/class, same raid/class, broad class |

---

## Metrics Definitions

### Total DPS
All damage divided by encounter duration.

### Boss DPS
Damage to boss targets divided by encounter duration.

### Priority Damage
Damage to encounter-important non-boss targets. Requires encounter rules.

### Uptime
Percent of encounter time where the player was meaningfully active.

Implementation can start simple:

```text
active time = time between first and last meaningful player action
```

Later versions can account for dead time, forced downtime, range issues, immunities, and phase transitions.

### Damage Share
Player damage divided by total raid damage for the selected scope.

### Gear Band
Relative gear bucket based on observed characters in the selected context.

### Confidence
A label describing how specific and well-supported the comparison is.

---

## Implementation Notes

### Default Sorting

Default sort should probably be **Boss DPS** for boss encounters and **Total DPS** for whole-raid summaries, with the selected metric clearly highlighted.

Recommended default:

```text
Raid summary default: Boss DPS
Toggle available: Total DPS
```

Reason: Boss DPS is usually more leadership-useful and less vulnerable to padding.

### Padding Handling

Do not hide total damage. Instead, contextualize it.

Example:

> High total damage, but much of the lead comes from add-heavy encounters.

### Sample Size

Always show sample size or confidence when making comparisons beyond the current report.

Example:

```text
Compared against 184 Mage boss kills in Molten Core.
```

If sample size is low, prefer:

```text
Comparison unavailable: not enough similar logs.
```

### No Forced Tier List

Avoid S/A/B/C tiers in the default product.

Use:

- damage profiles
- relative summaries
- boss-specific views
- class context
- confidence labels

Not:

- universal class rankings
- player tier labels
- opaque parse scores

---

## Suggested Empty / Low Data States

### Not Enough Comparison Data

```text
Not enough similar logs for a reliable comparison.
Showing this raid’s raw damage summary only.
```

### Missing Gear Data

```text
Gear context unavailable for this report.
Damage summaries are shown without gear adjustment.
```

### Missing Priority Rules

```text
Priority damage is not configured for this encounter yet.
Showing boss damage and total damage instead.
```

---

## Design Tone

Chronicle should sound analytical, neutral, and helpful.

Good:

- “Strong boss damage”
- “Low uptime reduced output”
- “Add-heavy damage profile”
- “Typical for gear”
- “Comparison broadened due to sample size”

Avoid:

- “Bad player”
- “Failed parse”
- “Padding garbage”
- “Underperformer”
- “C-tier DPS”

---

## Final UX Goal

The DPS summary should let a raid leader quickly answer:

1. Who contributed the most meaningful damage?
2. Who had high total damage because of adds or cleave?
3. Who had low output because of uptime or death?
4. Which bosses need deeper review?
5. Which classes had consistent or unusual damage profiles?
6. Which comparisons are reliable, and which are broad approximations?

The default page should be simple enough for a casual raid leader and deep enough that advanced users can drill into exact boss/class/gear contexts.
