package chroniclesdk

type ItemTooltip struct {
	Entry         int32            `json:"entry"`
	Name          string           `json:"name"`
	Quality       int32            `json:"quality"`
	ItemLevel     int32            `json:"item_level"`
	Icon          string           `json:"icon"`
	Bonding       int32            `json:"bonding"`
	InventoryType int32            `json:"inventory_type"`
	ItemClass     int32            `json:"item_class"`
	ItemSubclass  int32            `json:"item_subclass"`
	Stats         []ItemStat       `json:"stats,omitempty"`
	Armor         int32            `json:"armor,omitempty"`
	Block         int32            `json:"block,omitempty"`
	DamageRanges  []ItemDamage     `json:"damage_ranges,omitempty"`
	Delay         int32            `json:"delay,omitempty"`
	Resistances   []ItemResistance `json:"resistances,omitempty"`
	Spells        []ItemSpell      `json:"spells,omitempty"`

	// Item set info (if item belongs to a set).
	Set *ItemSetInfo `json:"set,omitempty"`

	// Enchantment display name (if ?enchant= provided), shown as green text.
	Enchantment *string `json:"enchantment,omitempty"`
	// Random suffix name (if ?random_property= provided), e.g. "of the Owl".
	SuffixName *string `json:"suffix_name,omitempty"`
	// Random enchantment effect lines (e.g. "+3 Intellect", "+4 Spirit").
	RandomEnchantments []string `json:"random_enchantments,omitempty"`
	// True if item has a random_property but no ?random_property param was given.
	HasRandomProperty bool `json:"has_random_property,omitempty"`

	RequiredLevel int32  `json:"required_level,omitempty"`
	Description   string `json:"description,omitempty"`
}

type ItemStat struct {
	Type  int32 `json:"type"`
	Value int32 `json:"value"`
}

type ItemDamage struct {
	Min    float64 `json:"min"`
	Max    float64 `json:"max"`
	School int32   `json:"school"`
}

type ItemResistance struct {
	School int32 `json:"school"`
	Value  int32 `json:"value"`
}

type ItemSetInfo struct {
	ID      int32          `json:"id"`
	Name    string         `json:"name"`
	Items   []ItemSetPiece `json:"items"`
	Bonuses []ItemSetBonus `json:"bonuses"`
}

type ItemSetPiece struct {
	Entry         int32  `json:"entry"`
	Name          string `json:"name"`
	InventoryType int32  `json:"inventory_type"`
}

type ItemSetBonus struct {
	Threshold int32 `json:"threshold"` // pieces needed
	SpellID   int32 `json:"spell_id"`
}

type ItemSpell struct {
	SpellID int32 `json:"spell_id"`
	Trigger int32 `json:"trigger"`
	Charges int32 `json:"charges,omitempty"`
}
