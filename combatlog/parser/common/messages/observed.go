package messages

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// ignoredObservedCreatures are remote world-buff NPCs whose references do not
// establish instance presence, regardless of server flavor. Keep their events
// intact for buff attribution; only catalogue membership is filtered.
var ignoredObservedCreatures = map[uint32]string{
	10719: "Herald of Thrall",
	1938:  "Dalar Dawnweaver",
	4949:  "Thrall",
}

// ignoredForeverObservedCreatures are utility summons, not instance inhabitants.
// This only filters catalogue membership, never their summon or other events.
var ignoredForeverObservedCreatures = map[uint32]string{
	214589: "Cozy Sleeping Bag",
}

// ObservationPolicy carries flavor-specific catalogue rules without coupling
// message types to the database package that defines server flavors.
type ObservationPolicy struct {
	WoWForever bool
}

// ObservedGUIDs is metadata membership, not combat activity. Affects deliberately
// omits some passive references, so never use it alone to catalogue an instance.
func ObservedGUIDs(m Message, policy ObservationPolicy) []guid.GUID {
	// Raid markers can reference units from a previous instance. Assignment or
	// removal alone is not evidence of presence; keep Affects for marker consumers.
	if _, ok := m.(*RaidMark); ok {
		return nil
	}
	ids := append([]guid.GUID(nil), m.Affects()...)
	add := func(id *guid.GUID) {
		if id != nil {
			ids = append(ids, *id)
		}
	}
	parse := func(raw string) {
		if id, err := guid.FromString(raw); err == nil {
			ids = append(ids, id)
		}
	}
	switch msg := m.(type) {
	case *Unit:
		add(msg.Owner)
		add(msg.Charm)
	case *Versions:
		add(msg.Player)
	case *PlayerPosition:
		parse(msg.Guid)
	case *UnitClassificationEvent:
		add(msg.Owner)
		add(msg.Controller)
	case *ThreatTank:
		for _, entry := range msg.Entries {
			parse(entry.ServerGUID)
		}
	}
	seen := make(map[guid.GUID]struct{}, len(ids))
	result := make([]guid.GUID, 0, len(ids))
	for _, id := range ids {
		if id.IsZero() {
			continue
		}
		if id.IsCreature() || id.IsVehicle() {
			if entry, ok := id.GetEntry(); ok {
				if _, ignored := ignoredObservedCreatures[entry]; ignored {
					continue
				}
			}
		}
		if id.IsCreature() && policy.WoWForever {
			if entry, ok := id.GetEntry(); ok {
				if _, ignored := ignoredForeverObservedCreatures[entry]; ignored {
					continue
				}
			}
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	return result
}
