package matchers 

import (
  "github.com/Emyrk/chronicle/combatlog/parser/regexs/compiled"
  "github.com/Emyrk/chronicle/combatlog/parser/types"
)

func ReAuraDispel() *types.Pattern {
  return types.FromCompiled[*compiled.ReAuraDispelResult](compiled.CompiledReAuraDispel)
}

func ReAuraFade() *types.Pattern {
  return types.FromCompiled[*compiled.ReAuraFadeResult](compiled.CompiledReAuraFade)
}

func ReAuraGainHarmfulHelpful() *types.Pattern {
  return types.FromCompiled[*compiled.ReAuraGainHarmfulHelpfulResult](compiled.CompiledReAuraGainHarmfulHelpful)
}

func ReAuraInterrupt() *types.Pattern {
  return types.FromCompiled[*compiled.ReAuraInterruptResult](compiled.CompiledReAuraInterrupt)
}

func ReBugDamageSpellHitOrCrit() *types.Pattern {
  return types.FromCompiled[*compiled.ReBugDamageSpellHitOrCritResult](compiled.CompiledReBugDamageSpellHitOrCrit)
}

func ReCreates() *types.Pattern {
  return types.FromCompiled[*compiled.ReCreatesResult](compiled.CompiledReCreates)
}

func ReDamageAbsorbResist() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageAbsorbResistResult](compiled.CompiledReDamageAbsorbResist)
}

func ReDamageBlockParryEvadeDodgeDeflect() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageBlockParryEvadeDodgeDeflectResult](compiled.CompiledReDamageBlockParryEvadeDodgeDeflect)
}

func ReDamageHitOrCrit() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageHitOrCritResult](compiled.CompiledReDamageHitOrCrit)
}

func ReDamageHitOrCritSchool() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageHitOrCritSchoolResult](compiled.CompiledReDamageHitOrCritSchool)
}

func ReDamageImmune() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageImmuneResult](compiled.CompiledReDamageImmune)
}

func ReDamageMiss() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageMissResult](compiled.CompiledReDamageMiss)
}

func ReDamagePeriodic() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamagePeriodicResult](compiled.CompiledReDamagePeriodic)
}

func ReDamageProcResist() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageProcResistResult](compiled.CompiledReDamageProcResist)
}

func ReDamageReflect() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageReflectResult](compiled.CompiledReDamageReflect)
}

func ReDamageShield() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageShieldResult](compiled.CompiledReDamageShield)
}

func ReDamageSpellAbsorb() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellAbsorbResult](compiled.CompiledReDamageSpellAbsorb)
}

func ReDamageSpellAbsorbSelf() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellAbsorbSelfResult](compiled.CompiledReDamageSpellAbsorbSelf)
}

func ReDamageSpellBlockParryEvadeDodgeResistDeflect() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellBlockParryEvadeDodgeResistDeflectResult](compiled.CompiledReDamageSpellBlockParryEvadeDodgeResistDeflect)
}

func ReDamageSpellHitOrCrit() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellHitOrCritResult](compiled.CompiledReDamageSpellHitOrCrit)
}

func ReDamageSpellHitOrCritSchool() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellHitOrCritSchoolResult](compiled.CompiledReDamageSpellHitOrCritSchool)
}

func ReDamageSpellImmune() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellImmuneResult](compiled.CompiledReDamageSpellImmune)
}

func ReDamageSpellMiss() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellMissResult](compiled.CompiledReDamageSpellMiss)
}

func ReDamageSpellSplit() *types.Pattern {
  return types.FromCompiled[*compiled.ReDamageSpellSplitResult](compiled.CompiledReDamageSpellSplit)
}

func ReDurabilityLoss() *types.Pattern {
  return types.FromCompiled[*compiled.ReDurabilityLossResult](compiled.CompiledReDurabilityLoss)
}

func ReFallDamage() *types.Pattern {
  return types.FromCompiled[*compiled.ReFallDamageResult](compiled.CompiledReFallDamage)
}

func ReFullImmune() *types.Pattern {
  return types.FromCompiled[*compiled.ReFullImmuneResult](compiled.CompiledReFullImmune)
}

func ReFullResist() *types.Pattern {
  return types.FromCompiled[*compiled.ReFullResistResult](compiled.CompiledReFullResist)
}

func ReGain() *types.Pattern {
  return types.FromCompiled[*compiled.ReGainResult](compiled.CompiledReGain)
}

func ReGainsAttack() *types.Pattern {
  return types.FromCompiled[*compiled.ReGainsAttackResult](compiled.CompiledReGainsAttack)
}

func ReHappiness() *types.Pattern {
  return types.FromCompiled[*compiled.ReHappinessResult](compiled.CompiledReHappiness)
}

func ReHeal() *types.Pattern {
  return types.FromCompiled[*compiled.ReHealResult](compiled.CompiledReHeal)
}

func ReHealCrit() *types.Pattern {
  return types.FromCompiled[*compiled.ReHealCritResult](compiled.CompiledReHealCrit)
}

func ReHealHit() *types.Pattern {
  return types.FromCompiled[*compiled.ReHealHitResult](compiled.CompiledReHealHit)
}

func ReHonorableKill() *types.Pattern {
  return types.FromCompiled[*compiled.ReHonorableKillResult](compiled.CompiledReHonorableKill)
}

func ReKilledBy() *types.Pattern {
  return types.FromCompiled[*compiled.ReKilledByResult](compiled.CompiledReKilledBy)
}

func ReLavaSwimming() *types.Pattern {
  return types.FromCompiled[*compiled.ReLavaSwimmingResult](compiled.CompiledReLavaSwimming)
}

func ReLoot() *types.Pattern {
  return types.FromCompiled[*compiled.ReLootResult](compiled.CompiledReLoot)
}

func RePetDismissed() *types.Pattern {
  return types.FromCompiled[*compiled.RePetDismissedResult](compiled.CompiledRePetDismissed)
}

func RePetEats() *types.Pattern {
  return types.FromCompiled[*compiled.RePetEatsResult](compiled.CompiledRePetEats)
}

func ReReputationChange() *types.Pattern {
  return types.FromCompiled[*compiled.ReReputationChangeResult](compiled.CompiledReReputationChange)
}

func ReResourceDrain() *types.Pattern {
  return types.FromCompiled[*compiled.ReResourceDrainResult](compiled.CompiledReResourceDrain)
}

func ReSpellCastAttempt() *types.Pattern {
  return types.FromCompiled[*compiled.ReSpellCastAttemptResult](compiled.CompiledReSpellCastAttempt)
}

func ReSpellCastPerform() *types.Pattern {
  return types.FromCompiled[*compiled.ReSpellCastPerformResult](compiled.CompiledReSpellCastPerform)
}

func ReSpellCastPerformDurability() *types.Pattern {
  return types.FromCompiled[*compiled.ReSpellCastPerformDurabilityResult](compiled.CompiledReSpellCastPerformDurability)
}

func ReSpellCastPerformUnknown() *types.Pattern {
  return types.FromCompiled[*compiled.ReSpellCastPerformUnknownResult](compiled.CompiledReSpellCastPerformUnknown)
}

func ReUnitDieDestroyed() *types.Pattern {
  return types.FromCompiled[*compiled.ReUnitDieDestroyedResult](compiled.CompiledReUnitDieDestroyed)
}

func ReUnitDieDestroyedExp() *types.Pattern {
  return types.FromCompiled[*compiled.ReUnitDieDestroyedExpResult](compiled.CompiledReUnitDieDestroyedExp)
}

func ReUnitSlay() *types.Pattern {
  return types.FromCompiled[*compiled.ReUnitSlayResult](compiled.CompiledReUnitSlay)
}

func ReUsesConsumable() *types.Pattern {
  return types.FromCompiled[*compiled.ReUsesConsumableResult](compiled.CompiledReUsesConsumable)
}

func ReV2Cast() *types.Pattern {
  return types.FromCompiled[*compiled.ReV2CastResult](compiled.CompiledReV2Cast)
}

func ReV2CastsRankTarget() *types.Pattern {
  return types.FromCompiled[*compiled.ReV2CastsRankTargetResult](compiled.CompiledReV2CastsRankTarget)
}

func ReZoneInfo() *types.Pattern {
  return types.FromCompiled[*compiled.ReZoneInfoResult](compiled.CompiledReZoneInfo)
}

