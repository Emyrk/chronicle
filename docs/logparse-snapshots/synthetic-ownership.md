# Vanilla synthetic semantic ownership

This is an inventory of **executed behavior**, not a field-name snapshot schema.
The compatibility pipeline is `combatlog/parser/vanilla/synthetic/synthetic.go`.
Aura ownership and Razuvious correction have codecs in
`combatlog/parsernext/vanilla/synthetic`; complete Slain and absorption state codecs
remain beside their unchanged legacy owners. None makes a pipeline resumable.

| Stage (execution order) | Retained semantic state actually used | Ownership / snapshot status |
|---|---|---|
| Aura ownership (optional CC-v2) | `(target GUID, spell ID) -> (caster GUID, timestamp)` | Copied scalars only; moved with codec. Incoming spell/target pointers are read but not retained. Emitted aura source is a fresh scalar pointer. |
| Slain attribution | `currentZone` location; target-keyed `lastDamage` | **Shared message references.** Stores original `*messages.Damage`; assigns it to `Slain.Attribution` and may alias `Damage.Caster` into `Slain.Killer`. Complete owner codec includes zone state and references into the same canonical Damage graph used by pending buffers/ranking indexes; no Damage values are embedded. |
| Extra attacks | No evolving history used | Reads runtime context/GameDB/logger to generate events. Declared `currentZone` and `lastDamage` are initialized but never read or updated by processing. Do not serialize or fix these dead fields in a migration. |
| Resurrection detection | None | Stateless; output carries input spell pointer. No owner-retained graph node. |
| Enslaved demons | None | Stateless; logger is stored but unused. Outputs copied caster/target GUID values. |
| Possession | Fixed format configuration | No evolving state. Format affects effect selection/duration; logger is unused. Output aliases input spell pointer, but owner retains none. Format belongs to compatible construction/fingerprint. |
| Known objects | None | Stateless; may alias `Unit.Owner = Unit.Charm`, then emits copied owner/target GUID values. No retained owner graph. |
| Razuvious correction | `lastSlain time.Time`, `raz GUID` | Copied scalars only; moved with codec. Mutates incoming Damage amount/synthetic flag, without retaining Damage. Runs for all flavors. |
| Known armor (VanillaPlus only) | No effective cache entries on constructor path | `previous` starts nil. Reads may branch on existing entries, and writes occur only inside that branch, so normal processing never populates it. Leave this ineffective cache unchanged. |
| VanillaPlus shadow bosses (VanillaPlus only) | Fixed shadow-entry -> primary-entry mapping; primary-entry -> `*GUID` | **Shared Unit-field references**, not a scalar GUID set. `boss[entry] = &unit.Guid`; future corrections read that pointer and copy its value into Damage.Caster. Boundary codec copies primary GUID values under the audited absence of later production Unit.Guid mutation; the live alias algorithm remains unchanged. |
| Absorption | Target-keyed ordered slices of owned `*activeShield` | Shield values include applied/removed time, duration, caster, estimated capacity, school, exhaustion, name, and retained **`*chrondbc.Spell`**. Emits the retained spell as Absorbed.AbsorbSpell; DamageSpell comes from current Damage. Owner codec preserves all shield fields and ordered slices, with spell references resolved from the existing same-ID derivable spell graph. Logger is injected and unused by processing. |
| Judgement of Light credit | None | Stateless; aliases Heal.Caster to Heal.Target without retaining either. |

`mitigator` is constructed but **never invoked** by this pipeline; its current
method also does no semantic work. `casts.go` contains commented-out code only.
Neither is an active semantic owner. Wrapper duration counters are diagnostics,
not correlator state; wrapper flavor is fixed construction configuration.

## Why pointer identity matters

Slain tracking runs before Razuvious and VanillaPlus corrections. Its cached
Damage pointer therefore observes later in-place changes. A value-copy codec
must not silently replace this graph with independent damage records. Likewise,
VanillaPlus retains the address of a Unit's GUID, even though its output caster
pointer is newly allocated. The subsequent audit found no later production writes to that Unit field,
which permits value capture at complete-file boundaries without changing the live
alias algorithm.

Shared Damage values now use the bounded canonical graph adapter; immutable
spells use ID-only derivation under the fixed compatible resolver. Other shared
owners still require their own complete ownership inventory before adding codecs. Follow the archive's Allocate / Decode owned state / Resolve references /
Validate phases; do not manufacture hidden canonical objects during resolution.

## Scalar codec boundaries

Capture is nonterminal and performs no expiry. Razuvious clears only when a
subsequent Damage lies beyond the two-minute window; backwards timestamps and
exact-window timestamps retain existing behavior. A matching death at zero time
is valid. Aura ownership likewise preserves all candidates until normal message
processing expires them. No wall clock participates in capture or restore.

Both codecs return detached state and restore new owners. The enclosing session
must still enforce successful immutable-file boundaries, compatible fingerprints,
complete input prefixes, and capture of every other reachable owner. Finalized
projections are not used by these codecs.
