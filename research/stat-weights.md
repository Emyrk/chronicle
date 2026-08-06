# Published stat weights by WoW version

Research collected 2026-08-06 for seeding the gear builder's pinned stat-weight
presets (`/gear/weights`). Every number below was read from the cited source —
nothing is invented. Weights are expressed with the **gear builder's weight
keys** (`gearScoring.ts` `STAT_KEYS`) so they can be pasted into a weight set.

## How to read these

- **Normalization**: melee/hunter sets are normalized to `attack_power = 1`;
  caster sets to `spell_power = 1`; healer sets to healing/spell power = 1
  (unless noted). Only the *ratios* matter for ranking items.
- **Units per version**:
  - *Vanilla*: items carry hit/crit as **percent** ("Equip: improves your
    chance to get a critical strike by 1%"), so the weights are per 1%.
  - *TBC / WotLK*: items carry **ratings**, so the weights are per rating
    point. Do not mix the two — a vanilla "crit 25" preset would wildly
    overvalue WotLK crit *rating*.
- **Hit caps**: sim-derived weights bake in the source's gear baseline. A
  preset made near the hit cap values hit low (e.g. wowsims TBC Fury hit
  0.41); guides assuming a fresh character value it near the top. Presets
  should say which in their description.
- **Unmappable stats**: vanilla weapon-skill weights have no builder key and
  are omitted. `weapon_dps` maps to the builder's derived weapon-DPS pseudo
  stat.

Primary sources:
- **wowsims** default EP presets (`ui/<spec>/sim.ts` in
  [wowsims/classic](https://github.com/wowsims/classic),
  [wowsims/tbc](https://github.com/wowsims/tbc),
  [wowsims/wotlk](https://github.com/wowsims/wotlk)) — sim-derived, raid
  buffed, phase-typical BiS baseline.
- **Pawn 2.4.3 scales** ([tbcwowaddons.weebly.com/pawn.html](https://tbcwowaddons.weebly.com/pawn.html)) —
  Elitist Jerks / Maxdps-derived, primary stat normalized to 1.
- **Pawn 3.3.5 "Wowhead" scales** ([Road-block/Pawn Wowhead.lua](https://github.com/Road-block/Pawn/blob/master/Wowhead.lua)) —
  original-Wrath Wowhead weights, best stat = 100.
- **Icy Veins Classic** stat-priority pages — numeric equivalences only.

---

## Vanilla (1.12 / Classic Era — Turtle-adjacent)

Weights per **1%** hit/crit, per point of attributes/AP/SP. Source: wowsims
Classic default presets unless noted; guide equivalences from Icy Veins for
cross-checking (warrior 1% crit ≈ 25–30 AP, hunter 1% hit/crit ≈ 32 AP).

| Spec | Weights (builder keys) | Assumptions / source |
|---|---|---|
| **Fury Warrior** | `{"strength":2.51,"agility":1.86,"attack_power":1,"hit":28.67,"crit":25.1,"weapon_dps":11.92}` | below hit cap; [ui/warrior/sim.ts](https://github.com/wowsims/classic/blob/master/ui/warrior/sim.ts) |
| **Prot Warrior** | `{"stamina":2.34,"strength":1.56,"agility":2.77,"attack_power":0.32,"dodge":2.61,"parry":2.65,"defense":3.31,"block":1.32,"block_value":1.37,"hit":1.43,"crit":0.93,"armor":0.17}` | mitigation+threat blend; [ui/tank_warrior/sim.ts](https://github.com/wowsims/classic/blob/master/ui/tank_warrior/sim.ts) |
| **Combat Rogue** | `{"agility":2.38,"strength":1.26,"attack_power":1,"hit":29.44,"crit":17.92,"weapon_dps":10.49}` | dagger/sword neutral preset; [ui/rogue/sim.ts](https://github.com/wowsims/classic/blob/master/ui/rogue/sim.ts) |
| **Hunter** | `{"agility":2.5,"ranged_attack_power":1,"attack_power":1,"hit":32,"crit":32,"weapon_dps":6.32}` | Icy Veins equivalences (1 Agi ≈ 2.5 AP, 1% hit/crit ≈ 32 AP) grafted onto the wowsims ranged-DPS anchor — the raw wowsims preset undervalues agility; [Icy Veins](https://www.icy-veins.com/wow-classic/hunter-dps-pve-stat-priority), [ui/hunter/sim.ts](https://github.com/wowsims/classic/blob/master/ui/hunter/sim.ts) |
| **Mage** | `{"spell_power":1,"intellect":0.49,"hit":18.59,"crit":13.91,"haste":6.85,"mp5":0.11}` | fire/frost/arcane average, below the 10%/16% hit cap; [ui/mage/sim.ts](https://github.com/wowsims/classic/blob/master/ui/mage/sim.ts) |
| **Warlock** | `{"spell_power":1,"intellect":0.23,"hit":12.79,"crit":7.92,"haste":7.83,"mp5":0.14}` | [ui/warlock/sim.ts](https://github.com/wowsims/classic/blob/master/ui/warlock/sim.ts) |
| **Shadow Priest** | `{"spell_power":1,"intellect":0.16,"spirit":0.01,"hit":5.51,"crit":5.99,"haste":1.65}` | [ui/shadow_priest/sim.ts](https://github.com/wowsims/classic/blob/master/ui/shadow_priest/sim.ts) |
| **Ele Shaman** | `{"spell_power":1,"intellect":0.14,"hit":12.37,"crit":7.57,"haste":1.49}` | [ui/elemental_shaman/sim.ts](https://github.com/wowsims/classic/blob/master/ui/elemental_shaman/sim.ts) |
| **Enh Shaman** | `{"strength":2.29,"agility":1.12,"attack_power":1,"spell_power":1.15,"hit":9.62,"crit":14.8,"weapon_dps":8.15}` | [ui/enhancement_shaman/sim.ts](https://github.com/wowsims/classic/blob/master/ui/enhancement_shaman/sim.ts) |
| **Balance Druid** | `{"spell_power":1,"intellect":0.16,"hit":11.75,"crit":7.5,"haste":0.8}` | [ui/balance_druid/sim.ts](https://github.com/wowsims/classic/blob/master/ui/balance_druid/sim.ts) |
| **Feral Druid (cat)** | `{"agility":2.43,"strength":2.4,"attack_power":1,"intellect":0.61,"hit":26.59,"crit":28.68,"mp5":0.79}` | powershifting; [ui/feral_druid/sim.ts](https://github.com/wowsims/classic/blob/master/ui/feral_druid/sim.ts) |
| **Feral Druid (bear)** | `{"stamina":7.3,"agility":4.5,"armor":3.57,"strength":2.38,"attack_power":1,"dodge":2.02,"defense":1.82,"hit":2.93,"crit":1.51,"health":0.45}` | [ui/feral_tank_druid/sim.ts](https://github.com/wowsims/classic/blob/master/ui/feral_tank_druid/sim.ts) |
| **Ret Paladin** | `{"strength":2.53,"agility":1.13,"attack_power":1,"spell_power":0.32,"hit":1.96,"crit":1.16,"weapon_dps":7.33}` | [ui/retribution_paladin/sim.ts](https://github.com/wowsims/classic/blob/master/ui/retribution_paladin/sim.ts) |
| **Healing Priest** | `{"healing":1,"intellect":2.73,"mp5":2.05,"spirit":1.63,"crit":0.75,"haste":0.28}` | mana-weighted; [ui/healing_priest/sim.ts](https://github.com/wowsims/classic/blob/master/ui/healing_priest/sim.ts) |
| **Resto Shaman** | `{"healing":1,"intellect":0.22,"spirit":0.05,"crit":0.67,"haste":1.29,"mp5":0.08}` | [ui/restoration_shaman/sim.ts](https://github.com/wowsims/classic/blob/master/ui/restoration_shaman/sim.ts) |
| **Resto Druid** | `{"healing":1,"intellect":0.38,"spirit":0.34,"crit":0.69,"haste":0.77}` | [ui/restoration_druid/sim.ts](https://github.com/wowsims/classic/blob/master/ui/restoration_druid/sim.ts) (holy paladin preset ships identical values — likely placeholder) |

Guide equivalences worth quoting in preset descriptions
([Icy Veins Classic](https://www.icy-veins.com/wow-classic/)):
1 Str = 2 AP (warrior/paladin), 14 AP = 1 weapon DPS, rogue 29 Agi = 1% crit,
hunter/warrior hit soft cap 9%/6% vs level 63, caster hit cap 16% (10% with
Elemental Precision), warlock ~60 Int = 1% spell crit.

---

## TBC (2.4.3)

Weights per **rating point**. Two independent sources; both listed where they
disagree. wowsims presets assume the default (near-capped) gear baseline; the
Pawn 2.4.3 scales assume uncapped hit and normalize the primary attribute
to 1.

| Spec | wowsims EP (AP/SP=1) | Pawn 2.4.3 (primary=1) |
|---|---|---|
| **Fury Warrior** | `{"strength":2.17,"agility":1.4,"attack_power":1,"hit":0.41,"crit":1.83,"haste":2.07,"expertise":3.29,"armor_penetration":0.5}` | `{"strength":1,"agility":0.57,"attack_power":0.54,"hit":0.57,"crit":0.7,"haste":0.41,"expertise":0.57,"armor_penetration":0.47,"weapon_dps":5.22}` |
| **Arms Warrior** | — | `{"strength":1,"agility":0.69,"attack_power":0.45,"hit":1,"expertise":1,"crit":0.85,"haste":0.57,"armor_penetration":1.1,"weapon_dps":5.31}` |
| **BM Hunter** | `{"agility":2.5,"ranged_attack_power":1,"hit":0.3,"crit":2.3,"haste":1.97,"armor_penetration":0.4}` | `{"agility":1,"ranged_attack_power":0.43,"intellect":0.8,"hit":1,"crit":0.8,"haste":0.5,"mp5":2.4}` |
| **Combat Rogue** | `{"agility":2.21,"strength":1.1,"attack_power":1,"hit":2.85,"crit":1.76,"haste":2.31,"expertise":3.11,"armor_penetration":0.44}` | `{"agility":1,"strength":0.5,"attack_power":0.45,"hit":1,"crit":0.81,"haste":0.9,"expertise":1.1,"armor_penetration":0.24,"weapon_dps":3}` |
| **Arcane Mage** | `{"spell_power":1,"intellect":1.29,"spirit":0.89,"crit":0.77,"haste":0.84,"mp5":0.61}` | `{"spell_power":1,"intellect":0.46,"spirit":0.59,"hit":0.87,"crit":0.6,"haste":0.59,"mp5":1.13}` |
| **Fire Mage** | — | `{"spell_power":1,"intellect":0.44,"hit":0.93,"crit":0.77,"haste":0.82,"mp5":0.9}` |
| **Destro Warlock** | `{"spell_power":1,"intellect":0.4,"spirit":0.1,"crit":0.8,"haste":1.2}` | `{"spell_power":1,"intellect":0.34,"spirit":0.25,"hit":1.6,"crit":0.87,"haste":1.15,"mp5":0.65}` |
| **Affli Warlock** | — | `{"spell_power":1,"intellect":0.4,"spirit":0.1,"hit":1.2,"crit":0.39,"haste":0.78,"mp5":1}` |
| **Shadow Priest** | `{"spell_power":1,"intellect":0.05,"spirit":0.11,"crit":0.16,"haste":1}` | `{"spell_power":1,"intellect":0.19,"spirit":0.21,"hit":1.12,"crit":0.76,"haste":0.65,"mp5":1}` |
| **Ele Shaman** | `{"spell_power":1,"intellect":0.33,"crit":0.78,"haste":1.25,"mp5":0.08}` | `{"spell_power":1,"intellect":0.31,"hit":0.9,"crit":1.05,"haste":0.9,"mp5":1.14}` |
| **Enh Shaman** | `{"strength":2.2,"agility":1.32,"intellect":0.08,"attack_power":1,"spell_power":0.43,"hit":1.67,"crit":1.36,"haste":1.94,"expertise":2.87,"armor_penetration":0.28}` | `{"strength":1,"agility":0.87,"intellect":0.34,"attack_power":0.5,"spell_power":0.3,"hit":0.67,"crit":0.98,"haste":0.64,"expertise":1.5,"weapon_dps":3}` |
| **Balance Druid** | `{"spell_power":1,"intellect":0.54,"spirit":0.1,"crit":0.84,"haste":1.29}` | `{"spell_power":1,"intellect":0.38,"spirit":0.34,"hit":1.21,"crit":0.62,"haste":0.8,"mp5":0.58}` |
| **Feral Druid (cat)** | `{"strength":2.27,"agility":3.5,"attack_power":1,"hit":3.2,"crit":2.37,"haste":1.36,"expertise":3.2,"armor_penetration":0.47}` | `{"strength":1.48,"agility":1,"attack_power":0.59,"hit":0.61,"crit":0.59,"haste":0.43,"expertise":0.61,"armor_penetration":0.4}` |
| **Ret Paladin** | `{"strength":2.42,"agility":1.88,"attack_power":1,"spell_power":0.35,"crit":1.98,"haste":3.27,"expertise":4.7,"armor_penetration":0.24}` | `{"strength":1,"agility":0.64,"attack_power":0.41,"spell_power":0.33,"hit":0.84,"crit":0.66,"haste":0.25,"expertise":0.87,"weapon_dps":5.4}` |
| **Prot Warrior** | `{"stamina":1,"strength":0.33,"agility":0.6,"defense":0.8,"dodge":0.7,"parry":0.58,"block":0.35,"block_value":0.59,"hit":0.67,"expertise":0.67,"armor":0.05}` | Pawn "War Prot" nearly identical |
| **Feral Druid (bear)** | `{"agility":4.6,"stamina":3.05,"strength":2.27,"attack_power":1,"expertise":7.3,"hit":3.5,"defense":2.2,"dodge":1.7,"armor":0.59}` | Pawn "Druid Bear" (sta=1): `{"stamina":1,"agility":0.48,"armor":0.1,"attack_power":0.34,"dodge":0.38,"defense":0.26,"haste":0.31}` |

TBC healer scales (Pawn 2.4.3, `intellect = 1`, per rating point):

| Stat | Holy Priest | Disc Priest | Holy Paladin | Resto Druid | Resto Shaman |
|---|---|---|---|---|---|
| intellect | 1 | 1 | 1 | 1 | 1 |
| spirit | 0.73 | 0.48 | 0.28 | 0.87 | 0.61 |
| healing | 0.81 | 0.72 | 0.54 | 1.21 | 0.9 |
| crit | 0.24 | 0.32 | 0.46 | 0.35 | 0.48 |
| haste | 0.60 | 0.57 | 0.39 | 0.49 | 0.74 |
| mp5 | 1.35 | 1.19 | 1.24 | 1.7 | 1.33 |

Sources: [wowsims/tbc ui presets](https://github.com/wowsims/tbc/tree/master/ui),
[Pawn 2.4.3 scales](https://tbcwowaddons.weebly.com/pawn.html)
("derived primarily from Elitist Jerks and Maxdps.com").
Useful caps for descriptions ([Icy Veins TBC](https://www.icy-veins.com/tbc-classic/fury-warrior-dps-pve-stat-priority)):
15.77 hit rating = 1%, 22.08 crit rating = 1%, melee hit cap 9% = 142 rating,
expertise cap 26 = 103 rating.

---

## WotLK (3.3.5)

Weights per **rating point**. wowsims presets are ICC-era raid-buffed
baselines; the Pawn/Wowhead 3.3.5 scales (best stat = 100) assume uncapped
hit. **ArP-stacking builds change everything** — near the 1400 ArP cap,
armor penetration becomes the top stat for physical specs (see the Rawr MM
hunter row).

| Spec | Weights (builder keys) | Source / assumptions |
|---|---|---|
| **Fury Warrior** | `{"strength":2.72,"agility":1.82,"attack_power":1,"expertise":2.55,"hit":0.79,"crit":2.12,"haste":1.72,"armor_penetration":2.17,"weapon_dps":6.29}` | wowsims, near hit cap; [ui/warrior/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/warrior/sim.ts) |
| **Prot Warrior** | `{"stamina":2.34,"agility":2.77,"strength":1.56,"defense":3.31,"parry":2.65,"dodge":2.61,"expertise":1.44,"hit":1.43,"block_value":1.37,"block":1.32,"armor_penetration":1.06,"crit":0.93}` | wowsims; [ui/protection_warrior/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/protection_warrior/sim.ts) |
| **Unholy DK (DW)** | `{"strength":3.22,"agility":0.62,"attack_power":1,"hit":1.92,"haste":1.85,"expertise":1.13,"crit":0.76,"armor_penetration":0.77}` | wowsims; [ui/deathknight/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/deathknight/sim.ts) |
| **Frost DK** | `{"hit":100,"strength":97,"expertise":81,"armor_penetration":61,"crit":45,"attack_power":35,"haste":28}` | Pawn/Wowhead 100-scale, uncapped; [Wowhead.lua](https://github.com/Road-block/Pawn/blob/master/Wowhead.lua) |
| **Blood Tank DK** | `{"stamina":1,"strength":0.33,"agility":0.6,"defense":0.8,"dodge":0.7,"parry":0.58,"expertise":0.67,"hit":0.67}` | wowsims, stamina-anchored; [ui/tank_deathknight/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/tank_deathknight/sim.ts) |
| **Survival Hunter** | `{"agility":2.65,"ranged_attack_power":1,"intellect":1.1,"hit":2.0,"crit":1.5,"haste":1.39,"armor_penetration":1.32,"stamina":0.5}` | wowsims, below hit cap; [ui/hunter/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/hunter/sim.ts) |
| **MM Hunter (BiS, ArP build)** | `{"armor_penetration":2.37,"agility":1.52,"crit":1.43,"intellect":0.7,"ranged_attack_power":0.68,"haste":0.31}` | Rawr @ 1380 ArP, hit-capped; [Warmane thread](https://forum.warmane.com/showthread.php?t=382445) |
| **Assassination Rogue** | `{"agility":1.86,"strength":1.14,"attack_power":1,"haste":1.48,"hit":1.39,"crit":1.32,"expertise":0.98,"armor_penetration":0.84}` | wowsims; [ui/rogue/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/rogue/sim.ts) |
| **Combat Rogue** | `{"armor_penetration":100,"agility":100,"expertise":82,"hit":80,"crit":75,"haste":73,"strength":55,"attack_power":50}` | Pawn/Wowhead 100-scale; 1400 ArP hard cap applies |
| **Fire Mage** | `{"spell_power":1,"haste":0.94,"crit":0.58,"intellect":0.48,"spirit":0.42,"hit":0.38,"mp5":0.09}` | wowsims, near hit cap; [ui/mage/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/mage/sim.ts) |
| **Arcane Mage** | `{"hit":100,"haste":54,"spell_power":49,"crit":37,"intellect":34,"spirit":14}` | Pawn/Wowhead 100-scale, uncapped |
| **Affli Warlock** | `{"spell_power":1,"hit":0.93,"haste":0.81,"spirit":0.54,"crit":0.53,"intellect":0.18}` | wowsims; [ui/warlock/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/warlock/sim.ts) |
| **Destro Warlock** | `{"hit":100,"spell_power":47,"haste":46,"spirit":26,"crit":16,"intellect":13}` | Pawn/Wowhead 100-scale, uncapped |
| **Shadow Priest** | `{"spell_power":1,"haste":1.65,"hit":0.87,"crit":0.74,"spirit":0.47,"intellect":0.11}` | wowsims; [ui/shadow_priest/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/shadow_priest/sim.ts) |
| **Ele Shaman** | `{"spell_power":1,"haste":1.29,"crit":0.67,"intellect":0.22,"mp5":0.08}` | wowsims, hit-capped; [ui/elemental_shaman/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/elemental_shaman/sim.ts) |
| **Enh Shaman** | `{"agility":1.59,"intellect":1.48,"strength":1.1,"spell_power":1.13,"attack_power":1,"haste":1.61,"hit":1.38,"crit":0.81,"armor_penetration":0.48}` | wowsims, spell-hit/expertise capped; [ui/enhancement_shaman/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/enhancement_shaman/sim.ts) |
| **Balance Druid** | `{"spell_power":1,"crit":0.82,"haste":0.8,"intellect":0.43,"spirit":0.34}` | wowsims, hit-capped; [ui/balance_druid/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/balance_druid/sim.ts) |
| **Feral Druid (cat)** | `{"hit":2.51,"expertise":2.44,"strength":2.4,"agility":2.39,"crit":2.23,"armor_penetration":2.08,"haste":1.83,"attack_power":1,"weapon_dps":16.5}` | wowsims; [ui/feral_druid/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/feral_druid/sim.ts) |
| **Feral Druid (bear)** | `{"stamina":7.3,"agility":4.5,"armor":3.57,"hit":2.93,"expertise":2.66,"strength":2.38,"haste":2.1,"dodge":2.02,"defense":1.82,"armor_penetration":1.58,"crit":1.51,"attack_power":1}` | wowsims; [ui/feral_tank_druid/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/feral_tank_druid/sim.ts) |
| **Ret Paladin** | `{"strength":2.53,"hit":1.96,"expertise":1.8,"haste":1.44,"crit":1.16,"agility":1.13,"attack_power":1,"armor_penetration":0.76,"spell_power":0.32,"weapon_dps":7.33}` | wowsims; [ui/retribution_paladin/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/retribution_paladin/sim.ts) |
| **Prot Paladin** | `{"stamina":1.14,"strength":1,"hit":0.79,"expertise":0.69,"agility":0.62,"parry":0.61,"defense":0.54,"block":0.52,"dodge":0.46,"crit":0.3,"block_value":0.28,"attack_power":0.26}` | wowsims; [ui/protection_paladin/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/protection_paladin/sim.ts) |
| **Disc Priest (healer)** | `{"intellect":2.73,"mp5":2.05,"spirit":1.63,"spell_power":1,"crit":0.75,"haste":0.28}` | wowsims, mana-weighted; [ui/healing_priest/sim.ts](https://github.com/wowsims/wotlk/blob/master/ui/healing_priest/sim.ts) |
| **Holy Paladin (healer)** | `{"intellect":100,"mp5":88,"spell_power":58,"crit":46,"haste":35}` | Pawn/Wowhead 100-scale |

---

## Gaps & caveats for seeding presets

- **Normalizations differ across the three source families** (AP/SP = 1 vs
  primary-attribute = 1 vs best-stat = 100). Ratios within one set are
  consistent; never mix numbers across sets. When seeding, pick one source
  per preset and name it in the description.
- **Hit-cap sensitivity** is the biggest practical issue — consider seeding
  two variants for melee ("under hit cap" / "hit capped") the way the
  original design mocked it.
- **Vanilla percent vs TBC/Wrath ratings**: the builder multiplies raw item
  stat values, so per-version presets already carry the right units — but a
  preset must only be pinned to datasets of its own version.
- Not found as published numbers anywhere reputable: vanilla mage/warlock EP
  from guides (only caps), TBC MM/Survival hunter beyond Pawn, WotLK
  Frost/Blood DK, Combat Rogue, Arcane Mage, Demo/Destro Warlock outside the
  Pawn/Wowhead scales. Warcraft Tavern blocks fetches (403); Fight Club
  vanilla spreadsheets and sixtyupgrades presets aren't published as pages.
- **wowsims Classic placeholder warning (confirmed)**: the Classic sim is
  forked from the WotLK codebase, and its default EP presets for
  Protection Warrior, Feral bear, Retribution Paladin, Healing Priest,
  Restoration Shaman, and Restoration Druid are verbatim WotLK numbers —
  per-rating weights that make no sense as vanilla per-percent weights.
  Do not use those six for vanilla; the app's built-in presets replace
  them with heuristics derived from vanilla stat conversions.
