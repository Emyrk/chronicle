# Consumable evidence contract

Chronicle emits one `consume` event for each observation of a probable physical consumable use. Multiple observations can share a `consume_id`. Copies projected into multiple encounters preserve both `consume_id` and `evidence_id`.

Aggregation across encounters must first deduplicate by `evidence_id`, then count distinct `consume_id` values.

## Initial evidence matrix

| Behavior | Source message | Consume kind | Attribution | Initial confidence |
| --- | --- | --- | --- | --- |
| Item-backed use | `SpellGo` with `item_id` | `DIRECT_ITEM` | caster and exact item | direct |
| Known consumable use spell | `SpellGo` without `item_id` whose spell is in the dataset catalog | `CAST` | caster and exact or candidate items | effect-derived or ambiguous |
| Known consumable buff gain | added buff aura whose spell is in the dataset catalog | `AURA` | target and exact or candidate items | direct when correlated to a recent direct use, otherwise effect-derived or ambiguous |
| Consumable effect active at pull | parse-wide active aura snapshot | `ACTIVE_AT_PULL` | target and exact or candidate items | effect-derived |
| Healing effect | self-`Heal` whose spell is a consumable use spell | `HEAL` | caster and exact or candidate items | direct when correlated to a recent direct use, otherwise effect-derived or ambiguous |
| Mana or rage gain | `ResourceChange` | `RESOURCE` | not emitted yet; schema retains `amount` and `resource_type` | future fixture refinement |
| Explosive or on-hit damage | `Damage` | `DAMAGE` | not emitted yet | future fixture refinement |
| Cooldown-only observation | inferred hit window | `COOLDOWN` | not emitted yet | inferred |

## Pre-pull behavior

An observed item use has `consumed_at_unix_milli`. If its matching consumable aura remains active, the original direct evidence and an `ACTIVE_AT_PULL` observation are projected into each applicable encounter with stable IDs. If Chronicle only observes an already-active aura, `consumed_at_unix_milli` remains absent.

A new aura application has new episode provenance and therefore a new `consume_id`. For example, one pre-pot projected into three encounters and a later pre-pot projected into six encounters produce nine encounter projections but only two distinct consume IDs.

## Known limits

The implementation recognizes item-backed `SpellGo` records, cast-only `SpellGo` records for dataset-catalog use spells, dataset-catalog buff auras, and self-heals from consumable use spells. Resource, damage, amount-band, and cooldown inference remain explicit future evidence sources. Native logs can omit direct uses, and one effect spell can map to multiple items; ambiguous candidates must not be silently collapsed.
