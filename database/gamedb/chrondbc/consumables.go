package chrondbc

// ConsumableCatalog is the dataset-scoped set of consumable items, the aura
// spells they can apply, and their direct use spells.
type ConsumableCatalog struct {
	itemsByID      map[int32]struct{}
	itemNamesByID  map[int32]string
	itemIDsBySpell map[SpellID][]int32
	// itemIDsByDirectSpell maps an item's own use spell (item_spell_ids) back
	// to the items carrying it. Heal lines from potions reference these spells.
	itemIDsByDirectSpell map[SpellID][]int32
}

// NewConsumableCatalog builds a catalog from item IDs and buff-spell mappings.
func NewConsumableCatalog(itemIDs []int32, itemIDsBySpell map[SpellID][]int32) *ConsumableCatalog {
	return NewConsumableCatalogWithDirectSpells(itemIDs, itemIDsBySpell, nil)
}

// NewConsumableCatalogWithDirectSpells builds a catalog that can additionally
// resolve direct item-use spells (for heal-derived evidence).
func NewConsumableCatalogWithDirectSpells(itemIDs []int32, itemIDsBySpell map[SpellID][]int32, itemIDsByDirectSpell map[SpellID][]int32) *ConsumableCatalog {
	return NewConsumableCatalogWithItemNames(itemIDs, nil, itemIDsBySpell, itemIDsByDirectSpell)
}

// NewConsumableCatalogWithItemNames builds a catalog that can resolve known
// consumable item IDs to their dataset-scoped names.
func NewConsumableCatalogWithItemNames(itemIDs []int32, itemNamesByID map[int32]string, itemIDsBySpell map[SpellID][]int32, itemIDsByDirectSpell map[SpellID][]int32) *ConsumableCatalog {
	catalog := &ConsumableCatalog{
		itemsByID:            make(map[int32]struct{}, len(itemIDs)),
		itemNamesByID:        make(map[int32]string, len(itemNamesByID)),
		itemIDsBySpell:       make(map[SpellID][]int32, len(itemIDsBySpell)),
		itemIDsByDirectSpell: make(map[SpellID][]int32, len(itemIDsByDirectSpell)),
	}
	for _, itemID := range itemIDs {
		catalog.itemsByID[itemID] = struct{}{}
	}
	for itemID, itemName := range itemNamesByID {
		catalog.itemNamesByID[itemID] = itemName
	}
	for spellID, candidates := range itemIDsBySpell {
		catalog.itemIDsBySpell[spellID] = append([]int32(nil), candidates...)
	}
	for spellID, candidates := range itemIDsByDirectSpell {
		catalog.itemIDsByDirectSpell[spellID] = append([]int32(nil), candidates...)
	}
	return catalog
}

// IsConsumableItem reports whether itemID belongs to the selected dataset's
// derived consumable catalog.
func (c *ConsumableCatalog) IsConsumableItem(itemID int32) bool {
	if c == nil {
		return false
	}
	_, ok := c.itemsByID[itemID]
	return ok
}

// ConsumableItemName returns the dataset-scoped name for a known consumable.
func (c *ConsumableCatalog) ConsumableItemName(itemID int32) (string, bool) {
	if c == nil {
		return "", false
	}
	name, ok := c.itemNamesByID[itemID]
	return name, ok
}

// IsConsumableBuff returns the candidate consumable items that can apply the
// given aura spell. The returned slice is a defensive copy.
func (c *ConsumableCatalog) IsConsumableBuff(spellID SpellID) ([]int32, bool) {
	if c == nil {
		return nil, false
	}
	items, ok := c.itemIDsBySpell[spellID]
	return append([]int32(nil), items...), ok
}

// IsConsumableDirectSpell returns the candidate consumable items whose own use
// spell matches spellID. Potion heal lines reference these spells directly.
// The returned slice is a defensive copy.
func (c *ConsumableCatalog) IsConsumableDirectSpell(spellID SpellID) ([]int32, bool) {
	if c == nil {
		return nil, false
	}
	items, ok := c.itemIDsByDirectSpell[spellID]
	return append([]int32(nil), items...), ok
}
