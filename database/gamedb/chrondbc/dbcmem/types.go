package dbcmem

// This file defines the shared types, package-level variables, and getter
// functions for DBC lookup data. The actual data is provided by a server-
// specific sub-package (e.g. dbcmem/turtle) which populates these variables
// via init(). Binary entry points blank-import the desired server package:
//
//	import _ "github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem/turtle"

// -----------------------------------------------------------------------
// Struct types (extracted from generated files)
// -----------------------------------------------------------------------

// SpellCastTime represents a cast time entry from SpellCastTimes.dbc
type SpellCastTime struct {
	ID       int32
	Base     int32 // Base cast time in milliseconds
	PerLevel int32 // Cast time reduction per level (negative = faster)
	Minimum  int32 // Minimum cast time in milliseconds
}

// SpellIcon represents an icon entry from SpellIcon.dbc
type SpellIcon struct {
	ID              int32
	TextureFilename string
}

// SpellDuration represents a duration entry from SpellDuration.dbc
type SpellDuration struct {
	ID               int32
	Duration         int32 // Base duration in milliseconds
	DurationPerLevel int32 // Duration increase per level
	MaxDuration      int32 // Maximum duration in milliseconds
}

// SpellRange represents a range entry from SpellRange.dbc
type SpellRange struct {
	ID       int32
	RangeMin float32 // Minimum range in yards
	RangeMax float32 // Maximum range in yards
	Flags    int32
	Name     string
}

// SpellCategory represents a category entry from SpellCategory.dbc
type SpellCategory struct {
	ID                 int32
	Flags              int32
	UsesPerWeek        int32
	Name               string
	MaxCharges         int32
	ChargeRecoveryTime int32 // Charge recovery time in milliseconds
	TypeMask           int32
}

// SpellRadius represents a radius entry from SpellRadius.dbc
type SpellRadius struct {
	ID             int32
	Radius         float32 // Base radius in yards
	RadiusPerLevel float32 // Radius increase per level
	RadiusMin      float32 // Minimum radius in yards
	RadiusMax      float32 // Maximum radius in yards
}

// SpellFocusObject represents a focus object entry from SpellFocusObject.dbc
// These are world objects (anvils, forges, moonwells, etc.) required to cast certain spells.
type SpellFocusObject struct {
	ID   int32
	Name string
}

// PeriodicSpell holds metadata about a periodic spell.
type PeriodicSpell struct {
	Name      string
	HasDirect bool // true if the spell also has a direct damage/healing component
}

// VulnerabilitySpell stores spell metadata for damage-taken modifiers.
type VulnerabilitySpell struct {
	Name          string
	SchoolBitmask int32
	PercentAffect *int32
	FlatAffect    *int32
}

// ExtraAttackSpell stores metadata about a spell that grants extra attacks.
type ExtraAttackSpell struct {
	Name            string
	NumExtraAttacks int32
}

// DurationModifier stores metadata for a passive spell that modifies
// the duration of other spells via AddFlatModifier or AddPctModifier.
type DurationModifier struct {
	SpellID    int32
	Name       string
	Percent    int32 // percentage change (e.g. 15 means +15%)
	Flat       int32 // flat change in milliseconds
	Deprecated bool  // true if the spell is not usable in-game
}

// -----------------------------------------------------------------------
// Package-level variables (nil until a server package's init() runs)
// -----------------------------------------------------------------------

// SpellCastTimes is a lookup table for cast times by ID.
var SpellCastTimes map[int32]SpellCastTime

// SpellIcons is a lookup table for spell icons by ID.
var SpellIcons map[int32]SpellIcon

// SpellDurations is a lookup table for spell durations by ID.
var SpellDurations map[int32]SpellDuration

// SpellRanges is a lookup table for spell ranges by ID.
var SpellRanges map[int32]SpellRange

// SpellCategories is a lookup table for spell categories by ID.
var SpellCategories map[int32]SpellCategory

// SpellRadii is a lookup table for spell radii by ID.
var SpellRadii map[int32]SpellRadius

// SpellFocusObjects is a lookup table for spell focus objects by ID.
var SpellFocusObjects map[int32]SpellFocusObject

// PeriodicSpells maps spell IDs to their metadata for all periodic spells.
var PeriodicSpells map[int32]PeriodicSpell

// VulnerabilitySpells maps spell IDs to vulnerability metadata.
var VulnerabilitySpells map[int32]VulnerabilitySpell

// ExtraAttackSpells maps spell IDs to metadata for all spells
// with the EffectAddExtraAttacks effect.
var ExtraAttackSpells map[int32]ExtraAttackSpell

// DurationModifiers maps modifier spell IDs to their metadata.
var DurationModifiers map[int32]DurationModifier

// DurationModifiersByClassBit provides a reverse lookup from target spell
// properties to the modifier spell IDs that can affect duration.
//
// Key 1: SpellClassSet (e.g. 8 = Rogue)
// Key 2: individual bit from the modifier's family mask
// Value: slice of modifier spell IDs (keys into DurationModifiers)
var DurationModifiersByClassBit map[int32]map[uint64][]int32

// -----------------------------------------------------------------------
// Getter functions (nil map reads return zero values — safe without data)
// -----------------------------------------------------------------------

// GetCastTime returns the SpellCastTime for the given ID.
// Returns zero value if not found.
func GetCastTime(id int32) SpellCastTime { return SpellCastTimes[id] }

// GetSpellIcon returns the SpellIcon for the given ID.
// Returns zero value if not found.
func GetSpellIcon(id int32) SpellIcon { return SpellIcons[id] }

// GetSpellDuration returns the SpellDuration for the given ID.
// Returns zero value if not found.
func GetSpellDuration(id int32) SpellDuration { return SpellDurations[id] }

// GetSpellRange returns the SpellRange for the given ID.
// Returns zero value if not found.
func GetSpellRange(id int32) SpellRange { return SpellRanges[id] }

// GetSpellCategory returns the SpellCategory for the given ID.
// Returns zero value if not found.
func GetSpellCategory(id int32) SpellCategory { return SpellCategories[id] }

// GetSpellRadius returns the SpellRadius for the given ID.
// Returns zero value if not found.
func GetSpellRadius(id int32) SpellRadius { return SpellRadii[id] }

// GetSpellFocusObject returns the SpellFocusObject for the given ID.
// Returns zero value if not found.
func GetSpellFocusObject(id int32) SpellFocusObject { return SpellFocusObjects[id] }

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

// Int32Ptr returns a pointer to the given int32 value.
// Used by generated vulnerability spell data.
func Int32Ptr(v int32) *int32 { return &v }
