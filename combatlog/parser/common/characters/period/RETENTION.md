# Bounded retained-message contract

This inventory covers production Go syntax in `common/characters` (including
period implementations), `vanilla/creatures`, and `wotlk/creatures`. It also
records activity-mark producers in `wotlk/instances`. It is not a proof over all
`messages.Message` implementations, external callers, arbitrary mark injection,
or future factories.

`TestCharacterRetentionSiteInventory` compares the AST inventory with
`testdata/retention_sites.txt`: file, receiver/function, and normalized expression.
It guards calls to Begin/Start/End/Bump/Died/Touch/EnterResetGracePeriod, retained
Moment construction, and LastActive/ResetMessage/LastSlain/pendingDeath writes.
The inventory includes forwarding and restore plumbing intentionally. Review
new sites and their argument provenance rather than blindly refreshing the file.
`Touch` in Characters/CharacterSet updates scheduling timestamps, not message
ownership. Hooks and phase transitions storing only `m.Date()` are not message
retention.

## Actual sinks

- WorkingPeriod.Begin retains Start and Bump retains LastActive; End retains End.
  Distinct moments may share the same canonical message.
- WorkingPeriod.Timeout/ResetTimeout construct a Timeout message, not the current
  arbitrary input event.
- InactivityPeriod.EnterResetGracePeriod retains ResetMessage. Its production
  caller is removed immobilizing Aura in ProcessCommonActivity.
- Base.Died and delayed-death wrappers retain LastSlain/pendingDeath as well as
  the period. They preserve the original canonical message, not a replacement.

## Type-gated production sources

All listed types have explicit retained codecs and graph owners. Damage remains
its existing canonical damage owner. Game DB spell pointers are canonical graph
references. Legacy Cast's types.Spell is instead a value descriptor with copied
optional rank and unit target. No generic reflection message serialization exists.

| Type | Concrete source families |
| --- | --- |
| Damage | Common direct/periodic/immune damage; Object; linked combat activity; positive-overkill scripted defeat |
| Aura | Common crowd control/debuff/reset grace; scripted aura cleanup; Mimiron repair; Sartharion marks |
| Slain | Common death/owner death; linked boss/party cleanup; XT heart cleanup |
| Timeout | Period timeout and reset timeout constructors |
| EncounterBoundary | Characters.Process explicit boundary closes active periods |
| UnitCombatEnter / UnitEvade | WotLK LogBased.Process |
| Heal / ResourceChange / Dispel | Vanilla Totem.Process; Heal also Object.Process and Mograine Whitemane activity |
| SpellGo | Totem casts/recall, DeathOnCast, Razorgore egg marks, Worg pup captures, Lich King raise dead, Mimiron repair |
| SpellStart | Arugal casting, Valithria rage prelude, Lich King epilogue; Mimiron repair completion |
| Cast | ProcessCommonActivity legacy CAST-v2 immobilizing CC |
| LegacyCast | Mimiron self-repair, final component completion closes linked machines with the cast event |
| AuraCast | Object.Process aura casting; coreRager.Process Golemagg's Trust mark |

The production-shaped regressions use actual character factories and Process:
Arugal SpellStart, generic legacy CC, Object AuraCast, Core Rager AuraCast mark,
and Mimiron LegacyCast final self-repair. They restore a serialized graph and
continue processing. `TestConcreteRetentionCodecContract` also exercises every
listed type through Moment and its registered message owner.

## Upstream activity marks

The current production parser search finds exactly these gameplay producers:

- `vanilla/creatures/moltencore.go`: coreRager.Process marks **AuraCast**.
- `vanilla/creatures/bwl.go`: razorgoreCharacter.Process marks **SpellGo**.
- `wotlk/instances/obsidiansanctum.go`: drake-power preprocessor marks **Aura**.

The methods in `common/messages/marks.go` forward arbitrary caller marks. The
receiver interface remains open; this list does not constrain callers outside
these production sources. ProcessCommonActivity checks marks *before* its type
switch, so a future marked type needs an explicit codec and regression.

## Residual dynamic-message gaps (not certified)

These paths can retain the current arbitrary input event, rather than a
locally type-gated event. A finite supported-type table cannot certify them:

- `ScriptedDefeatDetector.Observe`: a pending evade is confirmed by **any** later
  message timestamp. Scripted-defeat wrappers (and Hodir/Kologarn/Algalon/Thorim/
  Freya callers) pass that event to Died. For example SpellFail remains unsupported.
- `SneedShredder.Process`: pending ejection completes using current `m` when Sneed
  is active. `ThaddiusParty.Process`: first-event cleanup kills a previous spawn
  using current `m`.
- `AdsGoWithBoss.Process` and `MajordomoParty.Process`: inactive-state transitions
  can be caused by timeout processing on arbitrary input; linked deaths retain
  that input rather than the generated Timeout.
- Forwarding Start/Bump/Died/End methods, delayed-death callbacks, linked-party
  propagation, and `Characters.EndActive` accept `messages.Message`. EndActive's
  current outside caller is Hookable's new-fight hook, inheriting its trigger.
  Broodlord/Assembly/new-spawn cleanup similarly inherits the activity trigger.

Unknown retained kinds still fail closed. They are not silently dropped,
converted to Timeout, or serialized reflectively. A reliability claim must keep
these dynamic gaps visible. Closing them requires an explicit policy decision:
constrain the retained trigger semantics, or add the remaining legitimate input
variants with fixtures. This change does not change gameplay retention semantics.

## Schema decision

`spell_start`, `cast`, `legacy_cast`, and `aura_cast` are additive v1 retained
message kinds. Existing kinds retain their wire shape. Old readers reject new
kinds. The executable compatibility fence remains separate. AuraCast's Effect
and AuraEffect use primitive numeric DTO fields because their API JSON marshalers
emit display objects without matching unmarshalers; restoration explicitly casts
back to the enum types. All MessageBase private marks/activity state is preserved.
