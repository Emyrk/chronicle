package cosmetics

import (
	"fmt"
	"slices"
)

type Slot string

const (
	SlotName       Slot = "name"
	SlotBackground Slot = "background"
	SlotBorder     Slot = "border"
)

type Tier string

const (
	TierHonored Tier = "honored"
	TierRevered Tier = "revered"
	TierExalted Tier = "exalted"
)

type Definition struct {
	ID    string
	Label string
	Slot  Slot
	Tier  Tier
}

var catalog = []Definition{
	{ID: "name_rare", Label: "Rare", Slot: SlotName, Tier: TierHonored},
	{ID: "name_epic", Label: "Epic", Slot: SlotName, Tier: TierHonored},
	{ID: "name_gilded", Label: "Gilded", Slot: SlotName, Tier: TierHonored},
	{ID: "name_frost", Label: "Frostbitten", Slot: SlotName, Tier: TierHonored},
	{ID: "name_ember", Label: "Ember", Slot: SlotName, Tier: TierHonored},
	{ID: "name_argent", Label: "Argent", Slot: SlotName, Tier: TierHonored},
	{ID: "name_shimmer", Label: "Shimmer", Slot: SlotName, Tier: TierRevered},
	{ID: "name_storm", Label: "Stormcaller", Slot: SlotName, Tier: TierRevered},
	{ID: "name_legendary", Label: "Legendary", Slot: SlotName, Tier: TierRevered},
	{ID: "name_holy", Label: "Holy Light", Slot: SlotName, Tier: TierRevered},
	{ID: "name_fel", Label: "Felfire", Slot: SlotName, Tier: TierExalted},
	{ID: "name_prismatic", Label: "Prismatic", Slot: SlotName, Tier: TierExalted},
	{ID: "name_arcane", Label: "Arcane", Slot: SlotName, Tier: TierExalted},
	{ID: "name_thunderfury", Label: "Thunderfury", Slot: SlotName, Tier: TierExalted},
	{ID: "name_molten", Label: "Molten", Slot: SlotName, Tier: TierExalted},

	{ID: "background_glossy", Label: "Glossy", Slot: SlotBackground, Tier: TierRevered},
	{ID: "background_gleam", Label: "Gleam", Slot: SlotBackground, Tier: TierRevered},
	{ID: "background_satin", Label: "Satin", Slot: SlotBackground, Tier: TierRevered},
	{ID: "background_arcane", Label: "Arcane Flow", Slot: SlotBackground, Tier: TierExalted},
	{ID: "background_embers", Label: "Embers", Slot: SlotBackground, Tier: TierExalted},
	{ID: "background_snowfall", Label: "Snowfall", Slot: SlotBackground, Tier: TierExalted},
	{ID: "background_starfall", Label: "Starfall", Slot: SlotBackground, Tier: TierExalted},

	{ID: "border_elite", Label: "Elite", Slot: SlotBorder, Tier: TierExalted},
	{ID: "border_chasing", Label: "Chasing Light", Slot: SlotBorder, Tier: TierExalted},
	{ID: "border_storm", Label: "Stormcharged", Slot: SlotBorder, Tier: TierExalted},
}

func Catalog() []Definition {
	return slices.Clone(catalog)
}

func Lookup(id string) (Definition, bool) {
	for _, cosmetic := range catalog {
		if cosmetic.ID == id {
			return cosmetic, true
		}
	}
	return Definition{}, false
}

func ValidForSlot(id string, slot Slot) bool {
	if id == "" {
		return true
	}
	cosmetic, ok := Lookup(id)
	return ok && cosmetic.Slot == slot
}

type Selection struct {
	NameID       string
	BackgroundID string
	BorderID     string
}

func ValidateSelection(selection Selection) error {
	for _, item := range []struct {
		id   string
		slot Slot
	}{
		{selection.NameID, SlotName},
		{selection.BackgroundID, SlotBackground},
		{selection.BorderID, SlotBorder},
	} {
		if !ValidForSlot(item.id, item.slot) {
			return fmt.Errorf("invalid %s cosmetic %q", item.slot, item.id)
		}
	}
	return nil
}

func ActiveSelection(requested Selection, allowedIDs []string) Selection {
	allowed := make(map[string]struct{}, len(allowedIDs))
	for _, id := range allowedIDs {
		if _, known := Lookup(id); known {
			allowed[id] = struct{}{}
		}
	}
	return Selection{
		NameID:       activeForSlot(requested.NameID, SlotName, allowed),
		BackgroundID: activeForSlot(requested.BackgroundID, SlotBackground, allowed),
		BorderID:     activeForSlot(requested.BorderID, SlotBorder, allowed),
	}
}

func activeForSlot(requested string, slot Slot, allowed map[string]struct{}) string {
	if !ValidForSlot(requested, slot) {
		return ""
	}
	if _, ok := allowed[requested]; !ok {
		return ""
	}
	return requested
}

func IDs() []string {
	ids := make([]string, 0, len(catalog))
	for _, cosmetic := range catalog {
		ids = append(ids, cosmetic.ID)
	}
	return ids
}
