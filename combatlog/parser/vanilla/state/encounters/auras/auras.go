package auras

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

// AurasPersistDeath contains spell names that persist through death.
// Add entries manually as needed.
var AurasPersistDeath = map[string]struct{}{}

// AuraState holds the current stack count for an aura.
type AuraState struct {
	Stacks int32
}

// Tracking maintains active auras per unit.
type Tracking struct {
	// units maps GUID -> spell name -> aura state
	units map[guid.GUID]map[string]*AuraState
}

func New() *Tracking {
	return &Tracking{
		units: make(map[guid.GUID]map[string]*AuraState),
	}
}

// Get returns the current aura state for a unit's spell, or nil if not active.
func (t *Tracking) Get(unit guid.GUID, spellName string) *AuraState {
	if spells, ok := t.units[unit]; ok {
		return spells[spellName]
	}
	return nil
}

// GetAll returns all active auras for a unit.
func (t *Tracking) GetAll(unit guid.GUID) map[string]*AuraState {
	return t.units[unit]
}
func (t *Tracking) Process(m messages.Message) error {
	switch msg := m.(type) {
	case *messages.Aura:
		t.processAura(*msg)
	case *messages.Slain:
		t.processSlain(*msg)
	}
	return nil
}
func (t *Tracking) processAura(a messages.Aura) {
	switch a.Application {
	case types.AuraApplicationGains:
		// Ensure unit map exists
		if t.units[a.Target] == nil {
			t.units[a.Target] = make(map[string]*AuraState)
		}
		t.units[a.Target][a.SpellName] = &AuraState{Stacks: a.Amount}
	case types.AuraApplicationFades, types.AuraApplicationRemoved:
		if spells, ok := t.units[a.Target]; ok {
			delete(spells, a.SpellName)
		}
	}
}
func (t *Tracking) processSlain(s messages.Slain) {
	spells, ok := t.units[s.Victim]
	if !ok {
		return
	}
	// Remove all auras that don't persist death
	for spellName := range spells {
		if _, persists := AurasPersistDeath[spellName]; !persists {
			delete(spells, spellName)
		}
	}
}
