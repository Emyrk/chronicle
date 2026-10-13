package chrondbc

// SpellCastTime represents a cast time entry from SpellCastTimes.dbc.
type SpellCastTime struct {
	ID       int32
	Base     int32
	PerLevel int32
	Minimum  int32
}

// SpellIcon represents an icon entry from SpellIcon.dbc.
type SpellIcon struct {
	ID              int32
	TextureFilename string
}

// SpellDuration represents a duration entry from SpellDuration.dbc.
type SpellDuration struct {
	ID               int32
	Duration         int32
	DurationPerLevel int32
	MaxDuration      int32
}

// SpellRange represents a range entry from SpellRange.dbc.
type SpellRange struct {
	ID       int32
	RangeMin float32
	RangeMax float32
	Flags    int32
	Name     string
}

// SpellCategory represents a category entry from SpellCategory.dbc.
type SpellCategory struct {
	ID                 int32
	Flags              int32
	UsesPerWeek        int32
	Name               string
	MaxCharges         int32
	ChargeRecoveryTime int32
	TypeMask           int32
}

// SpellRadius represents a radius entry from SpellRadius.dbc.
type SpellRadius struct {
	ID             int32
	Radius         float32
	RadiusPerLevel float32
	RadiusMin      float32
	RadiusMax      float32
}

// SpellFocusObject represents a focus object entry from SpellFocusObject.dbc.
type SpellFocusObject struct {
	ID   int32
	Name string
}

// PeriodicSpell holds metadata about a periodic spell.
type PeriodicSpell struct {
	Name      string
	HasDirect bool
}

// ExtraAttackSpell stores metadata about a spell that grants extra attacks.
type ExtraAttackSpell struct {
	Name            string
	NumExtraAttacks int32
}

// DurationModifier stores metadata for a passive spell that modifies duration.
type DurationModifier struct {
	SpellID    int32
	Name       string
	Percent    int32
	Flat       int32
	Deprecated bool
}
