# Turtle WoW Renown calibration worksheet

**Draft values included as version 1 SQL templates in migration 000311, with Vanilla Plus ZG additions in versions 2 and 3 (migrations 000312–000313); not approved for launch.** Points below are actual points per eligible canonical boss kill, not a seven-day baseline. Every eligible kill earns points. `Progression` is a panel label only: a boss omitted from progression can still earn Renown. Migration 000311 removes the separate `final_boss_bonus` field; reset normalization remains a worksheet comparison, not a runtime multiplier. A single character normally has one eligible kill per boss per lockout, while separate guild teams can each earn eligible credit.

The clear times are the operator's approximate figures from [Capybara speedruns](https://capy.chronicleclassic.com/leaderboards/speedruns), **not** independently measured or verified here. Reset periods for these ten raids were supplied by the operator. Tier labels, difficulty, and points remain calibration proposals. The existing `RaidProgressionOrder` is display ordering, not a numeric difficulty/tier rating. Confirm the precise Turtle eligible manifests before a seed migration.

> **Draft, not seeded:** ZG's High Priests award zero and its four Edge of Madness variants share one achievable award per reset. AQ20 and K10 now total 8 and 6 per reset respectively, subject to per-boss review. Do not seed these numbers until the full policy is approved; optional ZG bosses still earn points.

## Draft raid budgets

| Raid | Size | Difficulty | Est. clean clear | Proposed tier/role | Reset | Total | Normalized (7d) | Notes |
| --- | ---: | --- | ---: | --- | ---: | ---: | ---: | --- |
| Lower Tower of Karazhan (K10) | 10 | base (verify) | 40m | custom 10-player | 5d | 6 | 8.4 | Four bosses at 1; Moroes at 2. Verify source support. |
| Upper Tower of Karazhan (K40) | 40 | base (verify) | 40m | custom 40-player | 7d | 55 | 55 | Provisional per-boss split; verify source support. |
| Naxxramas | 40 | base (verify) | 90m | endgame | 7d | 50 | 50 | Long clear and high tier. |
| Temple of Ahn'Qiraj (AQ40) | 40 | base (verify) | 50m | late | 7d | 35 | 35 | Bug Family is one canonical encounter. |
| Ruins of Ahn'Qiraj (AQ20) | 20 | base (verify) | 50m | catch-up / late | 3d | 8 | ≈18.67 | Five bosses at 1; Ossirian at 3. |
| Zul'Gurub (ZG) | 20 | base (verify) | 25m | catch-up | 3d | 7 | ≈16.33 | Five High Priests award 0; only one Edge of Madness boss is available per reset. |
| Blackwing Lair (BWL) | 40 | base (verify) | 40m | mid / high | 7d | 25 | 25 | Compare with ZG at about 16.33 normalized. |
| Onyxia's Lair | 40 | base (verify) | 6m | entry / short | 5d | 3 | 4.2 | Onyxia 2; Broodcommander Axelus 1. |
| Emerald Sanctum | 40 | normal / hard (verify) | ~20m | custom (verify) | 7d | 5 | 5 | Normal: Erennius 2 + Solnius 3. Hard: Solnius (Hard Mode) 5 as a single award. |
| Timbermaw Hold | 20 | hard | **unknown** | custom 20-player | 7d | 35 | 35 | Hard raid; clear time pending. |
| Molten Core (MC) | 40 | base (verify) | 45m | entry | 7d | 17 | 17 | Turtle omits Gehennas; Kronos vanilla needs a separate Gehennas award. |

The operator chose a **25-point BWL clear** rather than an arbitrary 1,000-point scale. ZG's five High Priest encounters award zero Renown because their kills are not required to kill Hakkar; they remain visible in logs and progression panels. The achievable non-priest kills include Mandokir, Jin'do, Hakkar, Gahz'ranka, and exactly one Edge of Madness variant: `7 × 7 / 3 = 16⅓` points per week, about 65% of BWL's 25. This is a provisional allocation, not an approved balance target. Clear time is one input, not a points-per-minute formula. Character and guild point awards currently share the same configured boss values.

### Draft boss allocations

| Reset | Raid | Bosses and actual points per eligible kill | Total | Normalized (7d) |
| ---: | --- | --- | ---: | ---: |
| 3d | ZG | High Priestess Jeklik 0; High Priest Venoxis 0; High Priestess Mar'li 0; Bloodlord Mandokir 1; High Priest Thekal 0; High Priestess Arlokk 0; Jin'do the Hexxer 1; Hakkar 3; Gahz'ranka 1; Edge of Madness 1 (one of Gri'lek, Hazza'rah, Renataki, Wushoolay) | 7 | ≈16.33 |
| 3d | AQ20 | Kurinnaxx 1; General Rajaxx 1; Moam 1; Buru the Gorger 1; Ayamiss the Hunter 1; Ossirian the Unscarred 3 | 8 | ≈18.67 |
| 5d | Onyxia | Onyxia 2; Broodcommander Axelus 1 | 3 | 4.2 |
| 5d | K10 | Lord Blackwald II 1; Brood Queen Araxxna 1; Grizikil 1; Clawlord Howlfang 1; Moroes 2 | 6 | 8.4 |
| 7d | Emerald Sanctum | Normal: Erennius 2; Solnius 3. Hard: Solnius (Hard Mode) 5 only. | 5 | 5 |
| 7d | MC | Lucifron 1; Magmadar 1; Garr 1; Shazzrah 1; Baron Geddon 1; Sulfuron Harbinger 1; Golemagg the Incinerator 1; Incindis 1; Basalthar & Smoldaris 1; Sorcerer-Thane Thaurissan 1; Majordomo Executus 2; Ragnaros 5 | 17 | 17 |
| 7d | BWL | Razorgore the Untamed 2; Vaelastrasz the Corrupt 2; Broodlord Lashlayer 2; Firemaw 2; Ebonroc 2; Flamegor 2; Chromaggus 2; Ezzel Darkbrewer 2; Nefarian 9 | 25 | 25 |
| 7d | AQ40 | The Prophet Skeram 3; Bug Family 3; Battleguard Sartura 3; Fankriss the Unyielding 3; Viscidus 3; Princess Huhuran 3; Twin Emperors 3; Ouro 3; C'Thun 11 | 35 | 35 |
| 7d | Timbermaw Hold | Kodiak & Rotgrowl 3; Trioch the Devourer 3; Karrsh the Sentinel 3; Chieftain Partath 3; Archdruid Kronn 3; Selenaxx Foulheart 3; Loktanag the Vile 3; Ormanos the Cracked 3; Ursol 3; Peroth'arn 8 | 35 | 35 |
| 7d | Naxxramas | Anub'Rekhan 3; Grand Widow Faerlina 3; Maexxna 3; Noth the Plaguebringer 3; Heigan the Unclean 3; Loatheb 3; Instructor Razuvious 3; Gothik the Harvester 3; Four Horsemen 3; Patchwerk 3; Grobbulus 3; Gluth 3; Thaddius 3; Sapphiron 3; Kel'Thuzad 8 | 50 | 50 |
| 7d | K40 | Keeper Gnarlmoon 6; Anomalus 6; Rupturan the Broken 6; Mephistroth 6; Ley-Watcher Incantagos 6; Echo of Medivh 6; King 6; Sanv Tas'dal 6; Kruul 7 | 55 | 55 |

**Turtle MC excludes Gehennas.** The registry's hostile inventory lists Gehennas, but the Turtle flavor's progression and speedrun requirements instead list its custom bosses. This Turtle allocation gives no Gehennas points and assigns 17 points across Turtle encounters. The separate vanilla MC default includes Gehennas at 1 point. ZG's four Edge of Madness encounter names share one award in the worksheet because only one is killable per reset. The actual SQL policy must still map each distinct canonical encounter name to one point; `Edge of Madness` is a worksheet label, not an existing canonical kill name. Gahz'ranka remains a separate optional award. Turtle-specific custom MC encounters remain listed rather than relying on a vanilla boss list. K10 and K40 are derived names under the Tower of Karazhan instance; its parent has no `ProgressionBosses` list. Treat these as separate raid budgets.

**Emerald Sanctum** is a seven-day, 40-player raid taking approximately 20 minutes, per the operator. Its registry and default rankings set list `Erennius`, `Solnius`, and `Solnius (Hard Mode)` as three bosses. The operator assigns Erennius 2 and normal Solnius 3 points. A hard-mode Solnius kill earns 5, equal to their combined normal-mode points, not an additional award on top. Before enabling hard-mode ratings, confirm which encounters produce credited kills on a hard-mode run so both modes total 5 without double counting. **Timbermaw Hold** is a hard, 20-player raid on a seven-day reset, per the operator. Its total is 35 points; its clear time remains unknown. The boss splits across all raids are provisional allocations of the chosen raid totals, now seeded as defaults for newly configured groups but not approved for launch.

## Vanilla Plus additions

Vanilla Plus (`vanillaplus` in dataset flavors) inherits the shared `vanilla` boss template and adds The Nameless Hermit and Azus the Bloodseeker in Zul'Gurub at 1 point each (9 achievable ZG points per reset including one rotating Edge of Madness variant), plus two Blackwing Lair encounters: Master Elemental Shaper Krixix 2 and Elementium Decapitator Mk III 2. Its separate **10-player Scarlet Monastery raid** receives 10 points per clear: Loksey, Brother Michael, Brigitte Abbendis, Fairbanks, Doan, Vishas, and Herod each earn 1; Mograine & Whitemane earns 3. Names match the canonical raid hostiles; the [Vanilla Plus Scarlet Monastery statistics](https://vanillaplus.chronicleclassic.com/leaderboards/statistics?instance=Scarlet+Monastery) are the operator's reference. Reset period and whether all inherited vanilla BWL encounters produce separate credited kills on Vanilla Plus still need verification.

## SQL defaults and follow-up work

- Keep canonical encounter names in one flavor-aware Go instance definition. Derive the legacy `ProgressionBosses []string` projection from labels; include non-progression Renown bosses in that same definition rather than copying strings into a second Go list.
- Migration 000311 creates versioned SQL default templates. Vanilla raid bosses are tagged `vanilla`; only Turtle-specific bosses are tagged `nightmare-of-ursol`. A newly created Turtle/Nightmare group policy combines both sets, excludes Gehennas, and includes the custom Molten Core bosses. A vanilla-only group receives the vanilla bosses, including Gehennas, without Turtle-only additions. Vanilla Plus groups combine `vanilla` and `vanillaplus` without Turtle-only bosses. Existing configured groups are not overwritten. An admin can change a boss's `renown_points` and rebuild ratings later.
- The same migration removes the `final_boss_bonus` column and API field, folding any existing configured bonus into the boss's points first. Production startup should confirm this small policy-table update is safe; it does not rewrite the large kill-fact tables.
- Do not ship a startup migration that rewrites a production-scale evidence table. The relevant rating policy tables were not present in the last read-only production preflight, but deployment state and migration numbering must be rechecked before applying schema changes.

## Required review before deployment

1. Reset periods were supplied by the operator: K10/Onyxia 5d; AQ20/ZG 3d; K40/Naxx/AQ40/BWL/MC/Emerald Sanctum/Timbermaw Hold 7d.
2. Review the proposed per-boss splits and cross-raid balance: ZG ~16.33, AQ20 ~18.67, MC 17, BWL 25, AQ40/Timbermaw 35, Naxx 50, and K40 55 per seven days.
3. Keep MC Gehennas in a non-Turtle (for example Kronos) policy, and confirm boss identity and eligibility for BWL Ezzel, Onyxia Axelus, and optional ZG encounters. Check whether every named encounter can produce a canonical ranking fact.
4. Confirm K10/K40 as separately derived instances; decide whether the two Solnius modes are mutually exclusive award variants, and gather Timbermaw Hold's approximate clear time.
5. Confirm which difficulty partitions these base awards should cover, especially Emerald Sanctum hard mode.
6. Verify canonical boss identity and per-clear points across other vanilla servers; version 1 now seeds every listed vanilla raid boss, while Turtle-only bosses require the `nightmare-of-ursol` flavor.
