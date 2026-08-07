package rankings

import (
	"context"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// UnitCategory classifies a GUID into one of the known unit types.
type UnitCategory int

const (
	CategoryUnknown         UnitCategory = iota
	CategoryPlayer                       // guid.IsPlayer()
	CategoryCreature                     // guid.IsCreature() — generic NPC/mob
	CategoryTotem                        // creature + totems.IsTotem(entry)
	CategoryObject                       // guid.IsObject()
	CategorySummoningPortal              // reserved for specific entry IDs (TBD)
	CategoryPet                          // guid.IsPet() or creature with owner
)

// EngagementResult stores the set of engaged units for a single encounter.
type EngagementResult struct {
	Engaged map[guid.GUID]UnitCategory
}

// EngagementTracker is an instance hook that categorises every unit seen during
// fights and tracks which units are engaged. Engagement is monotonic — once a
// unit is marked engaged it stays engaged for the encounter.
//
// A unit becomes engaged if:
//   - It is hostile (from unitdb).
//   - It damages or heals an already-engaged unit.
//   - It is damaged or healed by an already-engaged unit.
//   - Its owner (pet/totem) is engaged, or it owns an engaged pet/totem.
type EngagementTracker struct {
	instancehook.BaseHook
	units *unitdb.Units

	// Per-encounter state, reset on FightStarted.
	categories map[guid.GUID]UnitCategory
	engaged    map[guid.GUID]struct{}

	// Accumulated results across all encounters.
	results map[uuid.UUID]*EngagementResult
}

var _ instancehook.Hook = (*EngagementTracker)(nil)

func NewEngagementTracker(units *unitdb.Units) *EngagementTracker {
	return &EngagementTracker{
		units:   units,
		results: make(map[uuid.UUID]*EngagementResult),
	}
}

// FightStarted resets per-encounter tracking state.
func (t *EngagementTracker) FightStarted(_ uuid.UUID, _ messages.Message) {
	t.categories = make(map[guid.GUID]UnitCategory)
	t.engaged = make(map[guid.GUID]struct{})
}

// ProcessMessage classifies units and propagates engagement on each
// damage/heal interaction. If either side of an interaction is engaged,
// the other side becomes engaged too.
func (t *EngagementTracker) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if !active {
		return nil
	}

	switch msg := m.(type) {
	case *messages.Damage:
		if msg.Caster != nil {
			t.classifyAndEngage(*msg.Caster, msg.Target)
		}
	case *messages.Heal:
		t.classifyAndEngage(msg.Caster, msg.Target)
	}
	return nil
}

// FightEnded snapshots the engaged set and stores the result.
func (t *EngagementTracker) FightEnded(encounterID uuid.UUID, _ messages.Message) {
	result := make(map[guid.GUID]UnitCategory, len(t.engaged))
	for g := range t.engaged {
		result[g] = t.categories[g]
	}
	t.results[encounterID] = &EngagementResult{Engaged: result}
}

func (t *EngagementTracker) Finalize(_ context.Context) error { return nil }

// EncounterEngaged returns the engaged units for a specific encounter.
func (t *EngagementTracker) EncounterEngaged(encounterID uuid.UUID) map[guid.GUID]UnitCategory {
	if r, ok := t.results[encounterID]; ok {
		return r.Engaged
	}
	return nil
}

// AllEngagedPlayers returns the union of all engaged player GUIDs across all encounters.
func (t *EngagementTracker) AllEngagedPlayers() map[guid.GUID]struct{} {
	players := make(map[guid.GUID]struct{})
	for _, r := range t.results {
		for g, cat := range r.Engaged {
			if cat == CategoryPlayer {
				players[g] = struct{}{}
			}
		}
	}
	return players
}

// classifyAndEngage classifies both GUIDs (if new) and propagates engagement
// between them. If either is engaged, the other becomes engaged too.
func (t *EngagementTracker) classifyAndEngage(a, b guid.GUID) {
	t.classify(a)
	t.classify(b)

	_, aEng := t.engaged[a]
	_, bEng := t.engaged[b]

	if aEng && !bEng {
		t.markEngaged(b)
	} else if bEng && !aEng {
		t.markEngaged(a)
	}
}

// classify assigns a UnitCategory to a GUID the first time it is seen.
// Hostile units are immediately marked engaged.
func (t *EngagementTracker) classify(g guid.GUID) {
	if _, ok := t.categories[g]; ok {
		return
	}

	cat := CategoryUnknown
	switch {
	case g.IsPlayer():
		cat = CategoryPlayer
	case g.IsObject():
		cat = CategoryObject
	default:
		if entry, ok := g.GetEntry(); ok {
			if _, isTotem := totems.EntryIsTotem(entry); isTotem {
				cat = CategoryTotem
			} else if g.IsPet() {
				cat = CategoryPet
			} else {
				// Creatures with owners are pets.
				if info, ok := t.units.Info[g]; ok && info.Owner != nil {
					cat = CategoryPet
				} else {
					cat = CategoryCreature
				}
			}
		}
	}
	t.categories[g] = cat

	// Hostiles are always engaged.
	if info, ok := t.units.Info[g]; ok && !info.CanCooperate {
		t.markEngaged(g)
	}
}

// markEngaged marks a unit as engaged and propagates to its owner (if pet/totem)
// or to its pets/totems (if owner).
func (t *EngagementTracker) markEngaged(g guid.GUID) {
	if _, already := t.engaged[g]; already {
		return
	}
	t.engaged[g] = struct{}{}

	cat := t.categories[g]

	// If this is a pet/totem, engage its owner.
	if cat == CategoryPet || cat == CategoryTotem {
		if info, ok := t.units.Info[g]; ok && info.Owner != nil {
			owner := *info.Owner
			t.classify(owner)
			t.markEngaged(owner)
		}
	}

	// If this is a player, engage any of their pets/totems that we've seen.
	if cat == CategoryPlayer {
		for other, otherCat := range t.categories {
			if otherCat != CategoryPet && otherCat != CategoryTotem {
				continue
			}
			if info, ok := t.units.Info[other]; ok && info.Owner != nil && *info.Owner == g {
				t.markEngaged(other)
			}
		}
	}
}
