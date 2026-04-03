package unitdb

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// UnitType is derived from GUID bits — immutable for a given unit.
type UnitType int

const (
	UnitTypeUnknown  UnitType = iota
	UnitTypePlayer
	UnitTypeCreature // Includes GUID "pet" type — pet is a relation (creature with owner), not a distinct type
	UnitTypeObject
	UnitTypeVehicle
)

// UnitTypeFromGUID derives the UnitType from the GUID's high bits.
func UnitTypeFromGUID(g guid.GUID) UnitType {
	switch {
	case g.IsPlayer():
		return UnitTypePlayer
	case g.IsCreature(), g.IsPet():
		return UnitTypeCreature
	case g.IsObject():
		return UnitTypeObject
	case g.IsVehicle():
		return UnitTypeVehicle
	default:
		return UnitTypeUnknown
	}
}

// Affiliation describes a unit's relationship to the raid.
type Affiliation int

const (
	AffiliationUnknown  Affiliation = iota
	AffiliationFriendly
	AffiliationHostile
	AffiliationNeutral
)

// UnitRelation tracks the permanent owner of a unit (pets, totems, summons).
type UnitRelation struct {
	Owner *guid.GUID
}

// HasOwner returns true if the unit has a permanent owner.
func (r UnitRelation) HasOwner() bool { return r.Owner != nil }

// PossessionState tracks a temporary control effect on a unit.
type PossessionState struct {
	Controller guid.GUID
	Spell      *chrondbc.Spell
	StartTime  time.Time
	ExpiresAt  time.Time // StartTime + duration; zero value = no expiration
}

// UnitClassification is the full identity of a unit at a point in time.
type UnitClassification struct {
	Type        UnitType
	Affiliation Affiliation
	Relation    UnitRelation
	Possession  *PossessionState // nil = not possessed
}
