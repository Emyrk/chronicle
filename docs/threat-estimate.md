# Threat (estimated)

Vanilla and private-server combat logs carry no threat values. The **Threat
(estimated)** panel rebuilds each enemy's threat table from the events the log
does carry, with the classic threat rules below. It is an estimate by design and
is labelled "(estimated)" wherever it shows.

Processor: `frontend/chronicle/src/pages/Instance/EventsPanels/Threat/threat.processor.ts`
(pure, worker-safe; the run page's panel and the landing stats column both run it).

## Model

Each encounter keeps one table per enemy: `unit → threat`. Units are players and
their pets; a pet's threat is its own row (named after the pet, coloured by the
owner's class), never the owner's.

Every threat-generating event from a player or pet adds

```
threat = (amount + ability bonus) × unit modifier
```

to one or more enemy tables, where the unit modifier is the product of the
stance/form/class and buff modifiers active on the source at that moment.

### Event rules

| Event (stream) | Threat | Goes to |
| --- | --- | --- |
| Damage (`damage`) | effective damage (`amount − overkill`, plus absorbed tailers) + ability bonus, × modifiers | the damaged enemy |
| Heal (`heal`) | 0.5 × effective heal (`amount − overheal`), × buff modifiers | split evenly across the encounter's engaged, living enemies |
| Resource gain (`resource_change`, gains only) | rage × 5, energy × 5, mana × 0.5; no modifiers | split evenly across engaged, living enemies |
| Sunder Armor landed (`spell_go`, hits > 0) | 301 × modifiers | the target |
| Taunt, Growl (`spell_go`, hits > 0) | the taunter's threat on the target is raised to the current top threat on it | the target |
| Mocking Blow, Challenging Shout / Roar | the damage counts as usual; no threat change. The enemy is forced onto the caster for 6 s (tank inference) | — |
| Feign Death, Vanish (`spell_go` / `cast`) | the caster's threat drops to 0 on every enemy | all |
| Fade (`spell_go` / `cast`) | the caster loses 820 threat (rank 6) on every enemy for 10 s, then gets it back | all |
| Death (`slain`) | the unit's threat drops to 0 on every enemy | all |
| Boss threat drop (enemy damage with a listed spell) | the hit unit's threat on that enemy × factor | that enemy |

An enemy is **engaged** once a player or pet damages it or it damages one, until
it dies.

Ability bonuses (max rank, added to the damage before modifiers):

| Ability | Bonus |
| --- | --- |
| Heroic Strike | +173 |
| Revenge | +355 |
| Shield Slam | +254 |
| Sunder Armor (no damage) | 301 |

### Modifiers

Multiplicative. Talents are not in the log: **max-rank talents are assumed**
(Defiance 5/5, Feral Instinct 5/5, Improved Righteous Fury 3/3).

| Modifier | Factor | Applies to | Detected from |
| --- | --- | --- | --- |
| Warrior Defensive Stance + Defiance | 1.3 × 1.15 = 1.495 | all warrior threat | stance aura or stance cast |
| Warrior Battle / Berserker Stance | 0.8 | all warrior threat | stance aura or stance cast |
| Druid Bear / Dire Bear Form + Feral Instinct | 1.3 × 1.15 = 1.495 | all druid threat | form aura or form cast |
| Druid Cat Form | 0.71 | all druid threat | form aura or form cast |
| Rogue (class) | 0.71 | all rogue threat | class |
| Righteous Fury + Improved RF | 1.9 | holy-school damage | aura |
| Blessing of Salvation (incl. Greater) | 0.7 | all threat | aura |
| Tranquil Air Totem | 0.8 | all threat | aura |

**Unknown stance or form.** Stances and forms usually start before the pull, so
the log may never show them (the landing hero loads no aura stream at all). A
warrior, druid or paladin whose stance, form or Righteous Fury is unknown is
assumed to be tanking — Defensive Stance, Bear Form, Righteous Fury (the last only
when no aura stream is loaded) — while an
enemy has melee'd them at least once this encounter; otherwise Battle/Berserker
(0.8), caster form (1.0), no Righteous Fury.

### Who is tanking

Not hard-coded. An enemy's **tank** is the target of its latest melee swing
(auto attack, `spellId` 6603). During a Taunt / Growl / Mocking Blow /
Challenging Shout window the forced unit is the tank. With no melee seen yet, the
tank is the top-threat unit.

### Rendering

The panel shows one enemy's table: the entity-selected enemy, else the
encounter's boss once it has threat, else the enemy with the most total threat,
in the latest encounter that has threat. It is drawn with MeterBars' values
mode:

- the tank pinned on top with a `TANK` tag; each row shows threat and % of the
  tank's threat;
- marker lines at 110 % (melee pull) and 130 % (ranged pull) of the tank's
  threat, and a `PULLS` tag on any row over its line;
- a short log of aggro changes (the boss's melee target switching), taunts and
  threat drops, with the estimated % of the old tank at that moment.

The time range follows the run page (and the Watch tab's cursor in sync mode).

### Known boss threat drops

| Spell | Boss | Effect |
| --- | --- | --- |
| Knock Away (18670) | Broodlord Lashlayer | hit unit × 0.5 |
| Wing Buffet (23339) | Firemaw, Ebonroc, Flamegor | hit unit × 0.5 |

## Known gaps

- **Talents.** Ranks are invisible; max rank is assumed for Defiance, Feral
  Instinct and Improved Righteous Fury. Threat-reduction talents (Silent
  Resolve, Subtlety, Arcane Subtlety, Frost Channeling, Healing Grace, Improved
  Fade, Burning Soul, Master Demonologist, Shadow Affinity…) are not modelled,
  so priests, druids, mages, shamans and warlocks read high.
- **Ability flat threat** beyond the four above (Cleave, Shield Bash, Battle
  Shout, Demoralizing Shout/Roar, Maul, Swipe, Thunder Clap ×1.75, Searing
  Pain ×2, Holy Shield, Distracting Shot, buffs and debuffs that generate
  threat) is not modelled.
- **Righteous Fury on heals** is not applied.
- **Heal threat** is split across every engaged enemy, not only the enemies in
  combat with the healer.
- **Item and set effects** (Eye of Diminution, Fetish of the Sand Reaver, Black
  Amnestys, Bonereaver's Edge…) are not modelled.
- **Boss mechanics** beyond the short list above: threat wipes on phase
  changes or teleports (Thekal, Arlokk, Nefarian's phases, Ragnaros' submerge,
  Noth, Hakkar's Cause Insanity and similar mind controls), "aggro on the
  nearest" or random-target bosses, and threat-immune adds.
- **Resisted** Feign Death and Taunt look like successes when the log only has
  the cast.
- **Pre-pull** threat (pull timers, pre-pots, pet pulls before the encounter
  window) is not seen.

## Accuracy check

Run: octo ZG `-8uWqvAo4Qa4Oa5l` (instance `b180e8ed-c802-4ec7-b9c1-dc887368d1c6`),
**High Priest Venoxis** (encounter `ada43d47-e3af-412b-876c-803a40291c05`), all
seven threat streams, processed offline with `processIncrementally` exactly as
the panel does. Detected from auras: Racca Defensive Stance, Katq and Stevexd
Berserker Stance, Salvation on most of the DPS.

The panel's log for the pull:

```
 8.0s  Foxygon dies, threat reset          (the first tank)
 8.2s  Venoxis turns from Foxygon to Katq
13.8s  Racca forces every enemy (Challenging Shout)
23.7s  Racca taunts Venoxis
27.3s  Venoxis turns from Racca to Katq (est. 105% of Racca)
...
40.0s  Katq dies, threat reset
```

At 27.3 s Katq — a Berserker Stance warrior, so a melee pull at 110% — takes
Venoxis off the taunting tank. The estimate puts Katq at **105%** of Racca at
that swing: within 5 points of the melee pull line. The model matches the
observed pulled aggro; Racca taunts it back at 35.9 s and Katq dies at 40.0 s.

Same pull with only the landing hero's streams (no `aura`, no
`resource_change`): Katq's stance is unknown and Venoxis had already meleed
Katq at 8.2 s, so Katq reads as tanking (Defensive Stance) and the pull shows at
146%, and Salvation is missing from the DPS. The landing column is therefore a
coarser estimate than the run page.

Other pulls in the run do not line up as well, e.g. Hakkar turning to players
at 65–93% of the tank, and Arlokk, whose threat resets are not modelled — boss
mechanics from the known-gaps list.
