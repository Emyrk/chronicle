// Package combat implements Vanilla WoW combat formulas for the DPS
// simulation engine. All functions are pure (no I/O, no global state)
// and WASM-safe. Formulas are ported from the vmangos server core.
package combat

import "github.com/Emyrk/chronicle/simulation/gamedata"

// AttackType represents melee attack hand.
type AttackType int

const (
	AttackMainHand AttackType = iota
	AttackOffHand
	AttackRanged
)

// Outcome of a combat roll.
type Outcome int

const (
	OutcomeHit Outcome = iota
	OutcomeCrit
	OutcomeMiss
	OutcomeDodge
	OutcomeParry
	OutcomeGlancing
	OutcomeBlock
	OutcomeCrushing
	OutcomeResist
)

// String returns a human-readable outcome name.
func (o Outcome) String() string {
	switch o {
	case OutcomeHit:
		return "Hit"
	case OutcomeCrit:
		return "Crit"
	case OutcomeMiss:
		return "Miss"
	case OutcomeDodge:
		return "Dodge"
	case OutcomeParry:
		return "Parry"
	case OutcomeGlancing:
		return "Glancing"
	case OutcomeBlock:
		return "Block"
	case OutcomeCrushing:
		return "Crushing"
	case OutcomeResist:
		return "Resist"
	default:
		return "Unknown"
	}
}

// CombatUnit is the runtime stat snapshot used by combat formulas.
type CombatUnit struct {
	Level        int32
	Health       int32
	MaxHealth    int32
	Power        int32 // current mana/rage/energy
	MaxPower     int32
	PowerType    int32
	Armor        int32
	Resistances  [6]int32 // indexed by school-1 (holy=0..arcane=5)
	AttackPower  int32
	RangedAP     int32
	SpellPower   [gamedata.NumSchools]int32 // [0]=all schools bonus
	HitChance    float64                    // melee hit % from gear/talents
	SpellHit     float64                    // spell hit % from gear/talents
	CritChance   float64                    // melee crit %
	SpellCrit    float64                    // spell crit %
	WeaponSkill  int32
	DefenseSkill int32
	MHDmgMin     float64
	MHDmgMax     float64
	MHSpeedMs    int32
	OHDmgMin     float64
	OHDmgMax     float64
	OHSpeedMs    int32
	IsPlayer     bool
	CreatureType int32
}

// DamageResult is the outcome of a single damage event.
type DamageResult struct {
	Damage   int32
	Outcome  Outcome
	School   int32
	Resisted int32
	Absorbed int32
}

// GetResistanceForSchool returns the resistance value for a given school mask.
func (u *CombatUnit) GetResistanceForSchool(schoolMask int32) int32 {
	// Iterate school bits, return highest matching resistance.
	var best int32
	for i := 1; i < gamedata.NumSchools; i++ {
		if schoolMask&(1<<i) != 0 {
			r := u.Resistances[i-1]
			if r > best {
				best = r
			}
		}
	}
	return best
}
