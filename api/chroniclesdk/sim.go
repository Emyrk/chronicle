package chroniclesdk

// SimItem contains the simulation-relevant fields from world_item_template.
// This is a purpose-built type for the DPS sim — unlike ItemTooltip which
// serves display/rendering needs.
type SimItem struct {
	Entry         int32          `json:"entry"`
	Name          string         `json:"name"`
	Class         int32          `json:"class"`
	SubClass      int32          `json:"subclass"`
	ItemLevel     int32          `json:"item_level"`
	InventoryType int32          `json:"inventory_type"`
	Delay         int32          `json:"delay"`
	Armor         int32          `json:"armor"`
	Block         int32          `json:"block"`
	SetID         int32          `json:"set_id,omitempty"`
	Stats         []ItemStat     `json:"stats,omitempty"`
	Damage        []SimItemDamage `json:"damage,omitempty"`
	Resistances   [6]int32       `json:"resistances"` // [holy,fire,nature,frost,shadow,arcane]
	Spells        []SimItemSpell `json:"spells,omitempty"`
}

// SimItemDamage is a weapon damage range with school info.
type SimItemDamage struct {
	Min        float64 `json:"min"`
	Max        float64 `json:"max"`
	DamageType int32   `json:"damage_type"`
}

// SimItemSpell includes proc fields (PPMRate, cooldowns) that the tooltip
// endpoint omits because they're not needed for display.
type SimItemSpell struct {
	SpellID            int32   `json:"spell_id"`
	Trigger            int32   `json:"trigger"`
	Charges            int32   `json:"charges,omitempty"`
	PPMRate            float64 `json:"ppm_rate,omitempty"`
	CooldownMs         int32   `json:"cooldown_ms,omitempty"`
	CategoryCooldownMs int32   `json:"category_cooldown_ms,omitempty"`
}
