package rankings

import (
	"context"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

var _ instancehook.Hook = (*DPSTracker)(nil)

// UnitDamage holds accumulated damage for a single unit in an encounter.
type UnitDamage struct {
	DamageDone int64
	IsPlayer   bool
	OwnerGUID  *guid.GUID // Non-nil if this unit is a pet/totem/summon.
}

// DPSResult holds per-unit damage totals for a single encounter.
type DPSResult struct {
	Units map[guid.GUID]*UnitDamage
}

// DPSTracker is an instance hook that accumulates damage done per unit per
// encounter. At FightEnded it classifies each unit (player vs creature,
// owner relationship) via unitdb and stores the results keyed by encounter ID.
type DPSTracker struct {
	instancehook.BaseHook
	units *unitdb.Units

	// Per-encounter state, reset on FightStarted.
	current map[guid.GUID]int64

	// Results across all encounters.
	results map[uuid.UUID]*DPSResult
}

// NewDPSTracker creates a DPS tracker that uses the given unit database for
// classifying GUIDs at fight end.
func NewDPSTracker(units *unitdb.Units) *DPSTracker {
	return &DPSTracker{
		units:   units,
		current: make(map[guid.GUID]int64),
		results: make(map[uuid.UUID]*DPSResult),
	}
}

func (t *DPSTracker) FightStarted(_ uuid.UUID, _ messages.Message) {
	t.current = make(map[guid.GUID]int64)
}

func (t *DPSTracker) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if !active {
		return nil
	}

	dmg, ok := m.(*messages.Damage)
	if !ok {
		return nil
	}

	// Skip environmental damage (nil caster).
	if dmg.Caster == nil {
		return nil
	}

	// Only count actual damage dealt (skip misses which have Amount=0).
	if dmg.Amount > 0 {
		t.current[*dmg.Caster] += int64(dmg.Amount)
	}

	return nil
}

func (t *DPSTracker) FightEnded(encounterID uuid.UUID, _ messages.Message) {
	result := &DPSResult{
		Units: make(map[guid.GUID]*UnitDamage, len(t.current)),
	}

	for g, total := range t.current {
		cls := t.units.Classify(g)
		ud := &UnitDamage{
			DamageDone: total,
			IsPlayer:   cls.Type == unitdb.UnitTypePlayer,
		}
		if cls.Relation.HasOwner() {
			owner := *cls.Relation.Owner
			ud.OwnerGUID = &owner
		}
		result.Units[g] = ud
	}

	t.results[encounterID] = result
}

func (t *DPSTracker) Finalize(_ context.Context) error {
	return nil
}

// Result returns the accumulated DPS results keyed by encounter ID.
func (t *DPSTracker) Result() map[uuid.UUID]*DPSResult {
	return t.results
}
