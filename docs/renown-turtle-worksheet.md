# Turtle WoW Renown calibration worksheet

**Draft for review, not a deployed policy or migration.** Points below are actual points per eligible canonical boss kill, not a seven-day baseline. Every eligible kill earns points. `Progression` is a panel label only: a boss omitted from progression can still earn Renown. **The proposed policy** has no separate final-boss bonus or runtime reset multiplier; the current backend still has a `final_boss_bonus` field that must be removed before these numbers can be seeded. A single character normally has one eligible kill per boss per lockout, while separate guild teams can each earn eligible credit.

The clear times are the operator's approximate figures from [Capybara speedruns](https://capy.chronicleclassic.com/leaderboards/speedruns), **not** independently measured or verified here. Reset periods for these nine raids were supplied by the operator. Tier labels, difficulty, and points remain calibration proposals. The existing `RaidProgressionOrder` is display ordering, not a numeric difficulty/tier rating. Confirm the precise Turtle eligible manifests before a seed migration.

## Draft raid budgets

| Raid | Size | Difficulty | Est. clean clear | Proposed tier/role | Reset used for this draft | Draft points per eligible clear | Approx. points per 7 days | Notes |
| --- | ---: | --- | ---: | --- | ---: | ---: | ---: | --- |
| Lower Tower of Karazhan (K10) | 10 | base (verify) | 40m | custom 10-player | 5d | 30 | 42 | Verify source support. |
| Upper Tower of Karazhan (K40) | 40 | base (verify) | 40m | custom 40-player | 7d | 95 | 95 | Verify source support. |
| Naxxramas | 40 | base (verify) | 90m | endgame | 7d | 120 | 120 | Long clear and high tier. |
| Temple of Ahn'Qiraj (AQ40) | 40 | base (verify) | 50m | late | 7d | 90 | 90 | Bug Family is one canonical encounter. |
| Ruins of Ahn'Qiraj (AQ20) | 20 | base (verify) | 50m | catch-up / late | 3d | 24 | 56 | Lower size, but substantial time. |
| Zul'Gurub (ZG) | 20 | base (verify) | 25m | catch-up | 3d | 15 | 35 | Includes five non-progression encounters. |
| Blackwing Lair (BWL) | 40 | base (verify) | 40m | mid / high | 7d | 70 | 70 | ZG offers half the BWL weekly opportunity in this draft. |
| Onyxia's Lair | 40 | base (verify) | 6m | entry / short | 5d | 6 | 8.4 | Includes Broodcommander Axelus. |
| Emerald Sanctum | **verify** | normal / hard (verify) | **unknown** | custom / high (verify) | 7d | **TBD** | **TBD** | Erennius, Solnius, and Solnius (Hard Mode); clarify whether normal and hard Solnius are alternatives. |
| Molten Core (MC) | 40 | base (verify) | 45m | entry | 7d | 40 | 40 | Gehennas appears in `Bosses`, but not `ProgressionBosses`. |

The draft uses a **70-point BWL clear**, not 1,000. Given all 13 known ZG boss names earning at least one whole point and Hakkar earning more than an ordinary boss, the proposed 15-point ZG clear is near the smallest useful whole-number split. With the confirmed three-day reset it offers `15 × 7 / 3 = 35` points per week, half the proposed BWL weekly opportunity. This half ratio is a *hypothesis*, not an approved rule. Clear time is one input, not a points-per-minute formula. Character and guild point awards currently share the same configured boss values.

### Draft boss allocations

| Raid | Bosses and actual points per eligible kill | Total |
| --- | --- | ---: |
| K10 | Lord Blackwald II 5; Brood Queen Araxxna 5; Grizikil 5; Clawlord Howlfang 5; Moroes 10 | 30 |
| K40 | Keeper Gnarlmoon 10; Anomalus 10; Rupturan the Broken 10; Mephistroth 10; Ley-Watcher Incantagos 10; Echo of Medivh 10; King 10; Sanv Tas'dal 10; Kruul 15 | 95 |
| Naxxramas | Anub'Rekhan 7; Grand Widow Faerlina 7; Maexxna 7; Noth the Plaguebringer 7; Heigan the Unclean 7; Loatheb 7; Instructor Razuvious 7; Gothik the Harvester 7; Four Horsemen 7; Patchwerk 7; Grobbulus 7; Gluth 7; Thaddius 7; Sapphiron 7; Kel'Thuzad 22 | 120 |
| AQ40 | The Prophet Skeram 9; Bug Family 9; Battleguard Sartura 9; Fankriss the Unyielding 9; Viscidus 9; Princess Huhuran 9; Twin Emperors 9; Ouro 9; C'Thun 18 | 90 |
| AQ20 | Kurinnaxx 3; General Rajaxx 3; Moam 3; Buru the Gorger 3; Ayamiss the Hunter 3; Ossirian the Unscarred 9 | 24 |
| ZG | High Priestess Jeklik 1; High Priest Venoxis 1; High Priestess Mar'li 1; Bloodlord Mandokir 1; High Priest Thekal 1; High Priestess Arlokk 1; Jin'do the Hexxer 1; Hakkar 3; Gahz'ranka 1; Gri'lek 1; Hazza'rah 1; Renataki 1; Wushoolay 1 | 15 |
| BWL | Razorgore the Untamed 7; Vaelastrasz the Corrupt 7; Broodlord Lashlayer 7; Firemaw 7; Ebonroc 7; Flamegor 7; Chromaggus 7; Nefarian 14; Ezzel Darkbrewer 7 | 70 |
| Onyxia | Onyxia 4; Broodcommander Axelus 2 | 6 |
| Emerald Sanctum | Erennius **TBD**; Solnius **TBD**; Solnius (Hard Mode) **TBD** | **TBD** |
| MC | Lucifron 2; Magmadar 2; Garr 2; Shazzrah 2; Baron Geddon 2; Sulfuron Harbinger 2; Golemagg the Incinerator 2; Incindis 2; Basalthar & Smoldaris 2; Sorcerer-Thane Thaurissan 2; Gehennas 4; Majordomo Executus 6; Ragnaros 10 | 40 |

**Verify MC before seeding.** Its progression list names 12 encounters, while `Bosses` also includes Gehennas. Its progression label and ranking-fact eligibility need review; this provisional split includes Gehennas at four points instead of silently excluding that kill. ZG's five non-progression bosses and both Turtle-specific custom encounters are listed so the proposed totals do not depend on an incomplete speedrun requirement list. K10 and K40 are derived names under the Tower of Karazhan instance; its parent has no `ProgressionBosses` list. Treat these as separate raid budgets.

**Emerald Sanctum** is a seven-day raid per the operator. Its registry lists `Erennius`, `Solnius`, and `Solnius (Hard Mode)`; the default rankings set contains Erennius and Solnius, while a separate hard-mode set contains Solnius (Hard Mode). Its size, clear time, difficulty-specific award treatment, and points remain TBD. **Timbermaw Hold** is also registered as a Turtle raid, but no clear time or reset was supplied for it. The worksheet contains draft allocations for the nine raids with supplied times, plus an explicit Emerald Sanctum placeholder; it is not yet a complete Turtle catalog.

## Policy implementation after review

- Keep canonical encounter names in one flavor-aware Go instance definition. Derive the legacy `ProgressionBosses []string` projection from labels; include non-progression Renown bosses in that same definition rather than copying strings into a second Go list.
- Store the **approved actual per-kill points** as versioned, group-specific SQL boss policies. A seed migration can insert Turtle defaults only for groups and eligible bosses that exist at deploy time, or create an explicit default template for later group creation. Current migrations create no groups or numeric policies, so unconditional group-specific inserts would seed nothing. The template/application path needs a deliberate choice.
- Remove the `final_boss_bonus` column and API field via a new migration and regenerated sqlc code, rather than editing an already-numbered migration. Replace award calculation with `renown_points` only. Preserve any existing effective `renown_points + final_boss_bonus` when migrating a database that already contains configured boss policies; verify actual deployed state first.
- Do not ship a startup migration that rewrites a production-scale evidence table. The relevant rating policy tables were not present in the last read-only production preflight, but deployment state and migration numbering must be rechecked before applying schema changes.

## Required review before default seeding

1. Reset periods were supplied by the operator: K10/Onyxia 5d; AQ20/ZG 3d; K40/Naxx/AQ40/BWL/MC/Emerald Sanctum 7d. Verify Timbermaw Hold's reset before assigning its points.
2. Agree whether a complete ZG is worth half of BWL per week and whether the other proposed tier/size relationships feel fair.
3. Confirm boss identity and eligibility for MC Gehennas, BWL Ezzel, Onyxia Axelus, and optional ZG encounters. Check whether every named encounter can produce a canonical ranking fact.
4. Confirm K10/K40 as separately derived instances; get Emerald Sanctum's size and approximate clear time, decide whether the two Solnius modes are mutually exclusive award variants, and gather Timbermaw Hold's reset and clear time.
5. Confirm which difficulty partitions these base awards should cover, especially Emerald Sanctum hard mode.
6. Decide whether defaults are a versioned SQL template for future realm groups or a one-time seed only for existing Turtle groups.
