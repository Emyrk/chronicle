//go:generate go tool go-enum -f constants.go --nocase
package types

import (
	"errors"
	"strings"
)

// TODO: Can add like "Event" for gauntlet/suppression room style stuff
// ENUM(UNKNOWN,TRASH,BOSS)
type EncounterType string

// ENUM(fatigue,drowning,fall,lava,slime,fire)
type EnvironmentType string

// ENUM(Gain,Loss)
type ChangeDirection string

// ENUM(casts, begins to cast, channels, fails casting)
type CastActions string

// ENUM(DRUID,HUNTER,MAGE,PALADIN,PRIEST,ROGUE,SHAMAN,WARLOCK,WARRIOR,DEATHKNIGHT,UNKNOWN)
type HeroClasses string

// ENUM(Scourge,Orc,Troll,Tauren,Goblin,Human,Gnome,Dwarf,NightElf,BloodElf,Draenei,Unknown)
type HeroRaces string

// ENUM(NotSet,Unknown,Male,Female)
type HeroGender int

// ENUM(Unknown,Health,Mana,Rage,Happiness,Energy,Focus)
type Resource string

// HitType represents different types of hits in combat
// HitTypes can be more than 1.
// Example: A critical hit that was partially resisted
type HitType uint32

func (h HitType) Has(flag HitType) bool {
	return h&flag != 0
}
func (h HitType) String() string {
	var parts []string
	for k, v := range map[HitType]string{
		HitTypeOffHand:       "OffHand",
		HitTypeMainHand:      "MainHand",
		HitTypeHit:           "Hit",
		HitTypeCrit:          "Crit",
		HitTypePartialResist: "PartialResist",
		HitTypeFullResist:    "FullResist",
		HitTypeMiss:          "Miss",
		HitTypePartialAbsorb: "PartialAbsorb",
		HitTypeFullAbsorb:    "FullAbsorb",
		HitTypeGlancing:      "Glancing",
		HitTypeCrushing:      "Crushing",
		HitTypeEvade:         "Evade",
		HitTypeDodge:         "Dodge",
		HitTypeParry:         "Parry",
		HitTypeImmune:        "Immune",
		HitTypeEnvironment:   "Environment",
		HitTypeDeflect:       "Deflect",
		HitTypeInterrupt:     "Interrupt",
		HitTypePartialBlock:  "PartialBlock",
		HitTypeFullBlock:     "FullBlock",
		HitTypeSplit:         "Split",
		HitTypeReflect:       "Reflect",
		HitTypePeriodic:      "Periodic",
	} {
		if h.Has(k) {
			parts = append(parts, v)
		}
	}

	if len(parts) == 0 {
		return "None"
	}

	return strings.Join(parts, "|")
}

const (
	HitTypeNone          HitType = 0x00000000 // 0
	HitTypeOffHand       HitType = 0x00000001 // 1
	HitTypeHit           HitType = 0x00000002 // 2
	HitTypeCrit          HitType = 0x00000004 // 4
	HitTypePartialResist HitType = 0x00000008 // 8
	HitTypeFullResist    HitType = 0x00000010 // 16
	HitTypeMiss          HitType = 0x00000020 // 32
	HitTypePartialAbsorb HitType = 0x00000040 // 64
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
	HitTypeMainHand      HitType = 0x00400000
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
	NoneSchool     School = 0x00
	PhysicalSchool School = 0x01
	HolySchool     School = 0x02
	FireSchool     School = 0x04
	NatureSchool   School = 0x08
	FrostSchool    School = 0x10
	ShadowSchool   School = 0x20
	ArcaneSchool   School = 0x40
)

func (s School) Has(flag School) bool {
	return s&flag != 0
}
func (s School) String() string {
	if s == 0 {
		return "None"
	}
	var parts []string
	for k, v := range map[School]string{
		PhysicalSchool: "Physical",
		HolySchool:     "Holy",
		FireSchool:     "Fire",
		NatureSchool:   "Nature",
		FrostSchool:    "Frost",
		ShadowSchool:   "Shadow",
		ArcaneSchool:   "Arcane",
	} {
		if s.Has(k) {
			parts = append(parts, v)
		}
	}

	if len(parts) == 0 {
		return "Unknown"
	}

	return strings.Join(parts, "|")
}

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
		return NoneSchool, errors.New("invalid school")
	}
}

// ENUM(Unknown,Added,Removed,Modified)
type AuraState uint8

// ENUM(Unknown,Gains,Fades,Removed)
type AuraApplication string

func ParseResourceChange(s string) (ChangeDirection, error) {
	switch strings.ToLower(s) {
	case "gains":
		return ChangeDirectionGain, nil
	case "loses", "drains":
		return ChangeDirectionLoss, nil
	default:
		return "", errors.New("invalid resource change direction")
	}
}

type CastFlags uint32

func (h CastFlags) Has(flag CastFlags) bool {
	return h&flag != 0
}
func (h CastFlags) String() string {
	var parts []string
	for k, v := range map[CastFlags]string{
		CAST_FLAG_NONE:             "none",
		CAST_FLAG_HIDDEN_COMBATLOG: "hidden combatlog",
		CAST_FLAG_UNKNOWN2:         "unknown 2",
		CAST_FLAG_UNKNOWN3:         "unknown 3",
		CAST_FLAG_UNKNOWN4:         "unknown 4",
		CAST_FLAG_UNKNOWN5:         "unknown 5",
		CAST_FLAG_AMMO:             "ammo",
		CAST_FLAG_UNKNOWN7:         "unknown 7",
		CAST_FLAG_UNKNOWN8:         "unknown 8",
		CAST_FLAG_UNKNOWN9:         "unknown 9",
	} {
		if h.Has(k) {
			parts = append(parts, v)
		}
	}

	if len(parts) == 0 {
		return "None"
	}

	return strings.Join(parts, "|")
}

const (
	CAST_FLAG_NONE             CastFlags = 0   // (0x00000000)
	CAST_FLAG_HIDDEN_COMBATLOG CastFlags = 1   // (0x00000001)
	CAST_FLAG_UNKNOWN2         CastFlags = 2   // (0x00000002)
	CAST_FLAG_UNKNOWN3         CastFlags = 4   // (0x00000004)
	CAST_FLAG_UNKNOWN4         CastFlags = 8   // (0x00000008)
	CAST_FLAG_UNKNOWN5         CastFlags = 16  // (0x00000010)
	CAST_FLAG_AMMO             CastFlags = 32  // (0x00000020)
	CAST_FLAG_UNKNOWN7         CastFlags = 64  // (0x00000040)
	CAST_FLAG_UNKNOWN8         CastFlags = 128 // (0x00000080)
	CAST_FLAG_UNKNOWN9         CastFlags = 256 // (0x00000100)
)
