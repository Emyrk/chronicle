package epoch

import (
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

// PowerTypeToResource maps WotLK integer powerType values to types.Resource.
func PowerTypeToResource(pt int32) types.Resource {
	switch pt {
	case -2:
		return types.ResourceHealth
	case 0:
		return types.ResourceMana
	case 1:
		return types.ResourceRage
	case 2:
		return types.ResourceFocus
	case 3:
		return types.ResourceEnergy
	case 4:
		// Combo points — no direct Resource type; treat as unknown.
		return types.ResourceUnknown
	case 5:
		// Runes
		return types.ResourceUnknown
	case 6:
		// Runic Power
		return types.ResourceUnknown
	default:
		return types.ResourceUnknown
	}
}

// MissTypeToHitType maps WotLK miss type strings from _MISSED suffix
// to the corresponding types.HitType bitmask value.
func MissTypeToHitType(s string) types.HitType {
	switch strings.ToUpper(s) {
	case "ABSORB":
		return types.HitTypeFullAbsorb
	case "BLOCK":
		return types.HitTypeFullBlock
	case "DEFLECT":
		return types.HitTypeDeflect
	case "DODGE":
		return types.HitTypeDodge
	case "EVADE":
		return types.HitTypeEvade
	case "IMMUNE":
		return types.HitTypeImmune
	case "MISS":
		return types.HitTypeMiss
	case "PARRY":
		return types.HitTypeParry
	case "REFLECT":
		return types.HitTypeReflect
	case "RESIST":
		return types.HitTypeFullResist
	default:
		return types.HitTypeMiss
	}
}

// EnvironmentTypeFromString maps WotLK environmental type strings to
// types.EnvironmentType.
func EnvironmentTypeFromString(s string) types.EnvironmentType {
	switch strings.ToUpper(s) {
	case "DROWNING":
		return types.EnvironmentTypeDrowning
	case "FALLING":
		return types.EnvironmentTypeFall
	case "FATIGUE":
		return types.EnvironmentTypeFatigue
	case "FIRE":
		return types.EnvironmentTypeFire
	case "LAVA":
		return types.EnvironmentTypeLava
	case "SLIME":
		return types.EnvironmentTypeSlime
	default:
		return types.EnvironmentType(strings.ToLower(s))
	}
}

// DamageHitType derives a HitType bitmask from the _DAMAGE suffix fields.
func DamageHitType(critical, glancing, crushing *bool, resisted, blocked, absorbed int32) types.HitType {
	ht := types.HitTypeHit

	if critical != nil && *critical {
		ht = types.HitTypeCrit
	}
	if glancing != nil && *glancing {
		ht = types.HitTypeGlancing
	}
	if crushing != nil && *crushing {
		ht = types.HitTypeCrushing
	}

	if resisted > 0 {
		ht |= types.HitTypePartialResist
	}
	if blocked > 0 {
		ht |= types.HitTypePartialBlock
	}
	if absorbed > 0 {
		ht |= types.HitTypePartialAbsorb
	}

	return ht
}

// splitEvent decomposes a WotLK CLEU event name into its prefix and suffix.
// For example "SPELL_PERIODIC_DAMAGE" → ("SPELL_PERIODIC", "_DAMAGE").
// Special events that have no prefix/suffix return (event, "").
func splitEvent(event string) (prefix, suffix string) {
	// Check known prefixes in priority order (longest first).
	knownPrefixes := []string{
		"DAMAGE_SHIELD_MISSED",
		"SPELL_PERIODIC",
		"SPELL_BUILDING",
		"DAMAGE_SHIELD",
		"DAMAGE_SPLIT",
		"SWING",
		"RANGE",
		"SPELL",
		"ENVIRONMENTAL",
	}

	for _, pfx := range knownPrefixes {
		if strings.HasPrefix(event, pfx) {
			rest := event[len(pfx):]
			if rest == "" {
				// Prefix-only events like bare "SWING" shouldn't happen in
				// WotLK CLEU, but handle gracefully.
				return pfx, ""
			}
			if rest[0] == '_' {
				return pfx, rest
			}
		}
	}

	// Special events: UNIT_DIED, UNIT_DESTROYED, PARTY_KILL, ENCHANT_*, etc.
	return event, ""
}
