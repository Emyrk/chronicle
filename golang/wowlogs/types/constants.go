//go:generate go tool go-enum -f constants.go --nocase
package types

import (
	"errors"
	"strings"
)

// ENUM(casts, begins to cast, channels, fails casting)
type CastActions string

// ENUM(DRUID,HUNTER,MAGE,PALADIN,PRIEST,ROGUE,SHAMAN,WARLOCK,WARRIOR)
type HeroClasses string

// ENUM(Scourge,Orc,Troll,Tauren,Goblin,Human,Gnome,Dwarf,NightElf,BloodElf)
type HeroRaces string

// ENUM(NotSet,Unknown,Male,Female)
type HeroGender int

// ENUM(Health,Mana,Rage,Happiness,Energy,Focus)
type Resource string

// HitType represents different types of hits in combat
// HitTypes can be more than 1.
// Example: A critical hit that was partially resisted
type HitType uint32

const (
	HitTypeNone          HitType = 0x00000000
	HitTypeOffHand       HitType = 0x00000001
	HitTypeHit           HitType = 0x00000002
	HitTypeCrit          HitType = 0x00000004
	HitTypePartialResist HitType = 0x00000008
	HitTypeFullResist    HitType = 0x00000010
	HitTypeMiss          HitType = 0x00000020
	HitTypePartialAbsorb HitType = 0x00000040
	HitTypeFullAbsorb    HitType = 0x00000080
	HitTypeGlancing      HitType = 0x00000100
	HitTypeCrushing      HitType = 0x00000200
	HitTypeEvade         HitType = 0x00000400
	HitTypeDodge         HitType = 0x00000800
	HitTypeParry         HitType = 0x00001000
	HitTypeImmune        HitType = 0x00002000
	HitTypeEnvironment   HitType = 0x00004000
	HitTypeDeflect       HitType = 0x00008000
	HitTypeInterrupt     HitType = 0x00010000
	HitTypePartialBlock  HitType = 0x00020000
	HitTypeFullBlock     HitType = 0x00040000
	HitTypeSplit         HitType = 0x00080000
	HitTypeReflect       HitType = 0x00100000
	HitTypePeriodic      HitType = 0x00200000
)

// ParseHitMask assumes "full" blocks/resists/absorbs
func ParseHitMask(s string) (HitType, error) {
	switch s {
	case "hit", "hits":
		return HitTypeHit, nil
	case "crit", "crits":
		return HitTypeCrit, nil
	case "blocks", "blocked":
		return HitTypeFullBlock, nil
	case "dodges", "dodged":
		return HitTypeDodge, nil
	case "parries", "parried":
		return HitTypeParry, nil
	case "deflects", "deflected":
		return HitTypeDeflect, nil
	case "evades", "evaded":
		return HitTypeEvade, nil
	case "resisted":
		return HitTypeFullResist, nil
	default:
		return HitTypeNone, errors.New("invalid hit mask")
	}
}

func ParseHitOrCritShort(s string) (HitType, error) {
	switch s {
	case "h":
		return HitTypeHit, nil
	case "cr":
		return HitTypeCrit, nil
	default:
		return HitTypeNone, errors.New("invalid hit or crit short")
	}
}

type School uint16

const (
	None           School = 0x00
	PhysicalSchool School = 0x01
	HolySchool     School = 0x02
	FireSchool     School = 0x04
	NatureSchool   School = 0x08
	FrostSchool    School = 0x10
	ShadowSchool   School = 0x20
	ArcaneSchool   School = 0x40
)

func ParseSchool(s string) (School, error) {
	switch strings.ToLower(s) {
	case "physical":
		return PhysicalSchool, nil
	case "holy":
		return HolySchool, nil
	case "fire":
		return FireSchool, nil
	case "nature":
		return NatureSchool, nil
	case "frost":
		return FrostSchool, nil
	case "shadow":
		return ShadowSchool, nil
	case "arcane":
		return ArcaneSchool, nil
	default:
		return None, errors.New("invalid school")
	}
}

// ENUM(Unknown,Gains,Fades,Removed)
type AuraApplication string
