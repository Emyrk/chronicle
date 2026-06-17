package unitdb

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// Type aliases so existing unitdb consumers don't need to change imports.
type UnitType = types.UnitType

const (
	UnitTypeUnknown  = types.UnitTypeUnknown
	UnitTypePlayer   = types.UnitTypePlayer
	UnitTypeCreature = types.UnitTypeCreature
	UnitTypeObject   = types.UnitTypeObject
	UnitTypeVehicle  = types.UnitTypeVehicle
)

// UnitTypeFromGUID derives the UnitType from the GUID's high bits.
var UnitTypeFromGUID = types.UnitTypeFromGUID

// Type aliases so existing unitdb consumers don't need to change imports.
type Affiliation = types.Affiliation

const (
	AffiliationUnknown  = types.AffiliationUnknown
	AffiliationFriendly = types.AffiliationFriendly
	AffiliationHostile  = types.AffiliationHostile
	AffiliationNeutral  = types.AffiliationNeutral
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
