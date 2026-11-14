package wotlk

import (
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
)

// Legacy value helpers delegate to parsernext-owned CLEU semantics so both
// execution paths use one algorithm during migration.
func PowerTypeToResource(powerType int32) types.Resource {
	return cleu.PowerTypeToResource(powerType)
}

func MissTypeToHitType(value string) types.HitType { return cleu.MissTypeToHitType(value) }

func weaponHandHitType(isOffHand *bool) types.HitType { return cleu.WeaponHandHitType(isOffHand) }

func EnvironmentTypeFromString(value string) types.EnvironmentType {
	return cleu.EnvironmentTypeFromString(value)
}

func DamageHitType(critical, glancing, crushing *bool, resisted, blocked, absorbed int32) types.HitType {
	return cleu.DamageHitType(critical, glancing, crushing, resisted, blocked, absorbed)
}

func splitEvent(event string) (prefix, suffix string) { return cleu.SplitEvent(event) }
