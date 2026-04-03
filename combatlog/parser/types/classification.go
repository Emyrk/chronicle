package types

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

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
