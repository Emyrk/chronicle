package vanilla

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
)

// transmogGearMapping remembers both the authoritative item IDs reported by
// COMBATANT_TRANSMOG and the synthetic item ID observed in COMBATANT_INFO.
// Remembering the observed ID prevents a stale mapping from overwriting a
// genuinely changed item in a later equipment snapshot.
type transmogGearMapping struct {
	observedItemID    int
	hasObservedItemID bool
	itemID            int
	transmogID        int
}

func cloneCombatantGear(player combatant.Combatant) combatant.Combatant {
	player.GearSetups = append([]combatant.GearItem(nil), player.GearSetups...)
	return player
}

func (p *CombatantState) rememberCombatant(player combatant.Combatant) {
	if p.latestCombatantByName == nil {
		p.latestCombatantByName = make(map[string]combatant.Combatant)
	}
	p.latestCombatantByName[player.Name] = cloneCombatantGear(player)
}

func (p *CombatantState) applyKnownTransmogs(player *combatant.Combatant) {
	mappings := p.transmogsByName[player.Name]
	for slot, mapping := range mappings {
		if slot < 0 || int(slot) >= len(player.GearSetups) {
			continue
		}

		gear := &player.GearSetups[slot]
		if mapping.hasObservedItemID &&
			gear.ItemID != mapping.observedItemID &&
			gear.ItemID != mapping.itemID {
			continue
		}
		if !mapping.hasObservedItemID {
			mapping.observedItemID = gear.ItemID
			mapping.hasObservedItemID = true
			mappings[slot] = mapping
		}
		gear.ItemID = mapping.itemID
		gear.TransmogID = &mapping.transmogID
	}
}

func (p *CombatantState) recordTransmogs(name string, transmogs []combatant.Transmog) {
	previous := p.transmogsByName[name]
	mappings := make(map[int32]transmogGearMapping, len(transmogs))
	latest, hasLatest := p.latestCombatantByName[name]

	for _, item := range transmogs {
		mapping := transmogGearMapping{
			itemID:     int(item.ItemID),
			transmogID: int(item.TransmogID),
		}
		if old, ok := previous[item.Slot]; ok &&
			old.itemID == mapping.itemID && old.transmogID == mapping.transmogID {
			mapping.observedItemID = old.observedItemID
			mapping.hasObservedItemID = old.hasObservedItemID
		} else if hasLatest && item.Slot >= 0 && int(item.Slot) < len(latest.GearSetups) &&
			latest.GearSetups[item.Slot].ItemID != 0 {
			mapping.observedItemID = latest.GearSetups[item.Slot].ItemID
			mapping.hasObservedItemID = true
		}
		mappings[item.Slot] = mapping
	}
	if p.transmogsByName == nil {
		p.transmogsByName = make(map[string]map[int32]transmogGearMapping)
	}
	p.transmogsByName[name] = mappings
}

func (p *CombatantState) correctedCombatantForTransmog(name string, ts time.Time) *messages.Combatant {
	latest, ok := p.latestCombatantByName[name]
	if !ok {
		return nil
	}
	latest = cloneCombatantGear(latest)
	p.applyKnownTransmogs(&latest)
	latest.Seen = ts
	p.rememberCombatant(latest)
	return &messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant:   latest,
	}
}
