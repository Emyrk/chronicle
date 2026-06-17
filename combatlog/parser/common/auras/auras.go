package auras

import (
	"context"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
)

var _ instancehook.Hook = (*Tracking)(nil)
var _ characters.SetHook = (*Tracking)(nil)

// AuraState holds the current stack count for an aura.
type AuraState struct {
	Buff   bool
	Stacks int32
	// Beyond this time, the aura can no longer exist.
	MaxExistsUntil time.Time
	SpellID        chrondbc.SpellID
	SpellName      string
	Spell          *chrondbc.Spell // retained for attribute checks (e.g. death persistence)
}

// Tracking maintains active auras per unit.
type Tracking struct {
	// units maps GUID -> spell -> aura state
	units map[guid.GUID]map[chrondbc.SpellID]*AuraState
	// mods is loaded once per parse job and passed to MaxAuraDuration.
	mods *chrondbc.DurationModifierSet
	// emit is set after construction to inject synthetic aura messages into the
	// active fight's event stream.
	emit func(*messages.Aura)
}

func New(mods *chrondbc.DurationModifierSet) *Tracking {
	return &Tracking{
		units: make(map[guid.GUID]map[chrondbc.SpellID]*AuraState),
		mods:  mods,
	}
}

// SetEmit sets the callback used to inject synthetic aura messages into the
// active fight's event builder. Called from hookable wiring after construction.
func (t *Tracking) SetEmit(fn func(*messages.Aura)) {
	t.emit = fn
}

// ProcessMessage handles every message in the instance. Aura tracking runs
// regardless of fight-active state so pre-buffs are captured.
func (t *Tracking) ProcessMessage(_ bool, _ uuid.UUID, m messages.Message) error {
	switch msg := m.(type) {
	case *messages.Aura:
		if msg.SpellData == nil {
			return nil
		}
		switch msg.State {
		case types.AuraStateAdded, types.AuraStateModified:
			t.applyAura(msg)
		case types.AuraStateRemoved:
			t.removeAura(msg)
		}
	}
	return nil
}

func (t *Tracking) applyAura(msg *messages.Aura) {
	if _, ok := t.units[msg.Target]; !ok {
		t.units[msg.Target] = make(map[chrondbc.SpellID]*AuraState)
	}
	state, exists := t.units[msg.Target][msg.SpellData.ID]
	if !exists {
		state = &AuraState{}
		t.units[msg.Target][msg.SpellData.ID] = state
	}
	state.Stacks = msg.Amount
	state.Buff = msg.IsBuff
	maxDuration := chrondbc.MaxAuraDuration(msg.SpellData, t.mods)
	state.MaxExistsUntil = msg.Date().Add(maxDuration)
	state.SpellID = msg.SpellData.ID
	state.SpellName = msg.SpellName
	state.Spell = msg.SpellData
	t.units[msg.Target][msg.SpellData.ID] = state
}

func (t *Tracking) removeAura(msg *messages.Aura) {
	if spells, ok := t.units[msg.Target]; ok {
		delete(spells, msg.SpellData.ID)
		if len(spells) == 0 {
			delete(t.units, msg.Target)
		}
	}
}

// expireStale removes auras whose maximum possible duration has elapsed.
func (t *Tracking) expireStale(now time.Time) {
	for unitGUID, spells := range t.units {
		for spellID, state := range spells {
			if !state.MaxExistsUntil.IsZero() && now.After(state.MaxExistsUntil) {
				delete(spells, spellID)
			}
		}
		if len(spells) == 0 {
			delete(t.units, unitGUID)
		}
	}
}

// FightStarted expires stale auras and emits synthetic "added" messages for all
// tracked auras so the frontend can see pre-fight buffs.
func (t *Tracking) FightStarted(_ uuid.UUID, m messages.Message) {
	t.expireStale(m.Date())
	t.emitAllAuras(m.Date())
}

// FightEnded expires stale auras when an encounter ends.
func (t *Tracking) FightEnded(_ uuid.UUID, m messages.Message) {
	t.expireStale(m.Date())
}

// Finalize clears all tracked state when the instance is done.
func (t *Tracking) Finalize(_ context.Context) error {
	t.units = make(map[guid.GUID]map[chrondbc.SpellID]*AuraState)
	return nil
}

// ActivityChange clears non-persistent auras for characters that died.
// Auras with AttrEx3_DeathPersistent (elixirs, flasks, food buffs, etc.) are kept.
func (t *Tracking) ActivityChange(_ messages.Message, chars ...characters.Character) {
	for _, char := range chars {
		if !char.IsActive() {
			p, ok := char.CurrentPeriod()
			if ok && p.EndState == period.EndStateSlain {
				t.clearNonPersistent(char.ID())
			}
		}
	}
}

// clearNonPersistent removes auras that do not survive death.
func (t *Tracking) clearNonPersistent(unit guid.GUID) {
	spells, ok := t.units[unit]
	if !ok {
		return
	}
	for id, state := range spells {
		if state.Spell == nil || !state.Spell.Attrs.Has(chrondbc.AttrEx3_DeathPersistent) {
			delete(spells, id)
		}
	}
	if len(spells) == 0 {
		delete(t.units, unit)
	}
}

func (t *Tracking) CharacterAdded(_ messages.Message, _ ...characters.Character) {}

// emitAllAuras emits a synthetic aura message for every tracked aura on every unit.
func (t *Tracking) emitAllAuras(ts time.Time) {
	if t.emit == nil {
		return
	}
	for unitGUID, spells := range t.units {
		for _, aura := range spells {
			t.emit(&messages.Aura{
				MessageBase: messages.Base(ts, messages.WithSynthetic()),
				IsBuff:      aura.Buff,
				Target:      unitGUID,
				SpellName:   aura.SpellName,
				SpellData:   aura.Spell,
				Amount:      aura.Stacks,
				State:       types.AuraStateAdded,
			})
		}
	}
}

// --- Query methods ---

// HasAura returns true if the unit currently has the given aura tracked.
func (t *Tracking) HasAura(unit guid.GUID, spellID chrondbc.SpellID) bool {
	if spells, ok := t.units[unit]; ok {
		_, has := spells[spellID]
		return has
	}
	return false
}

// GetStacks returns the current stack count, or 0 if not present.
func (t *Tracking) GetStacks(unit guid.GUID, spellID chrondbc.SpellID) int32 {
	if spells, ok := t.units[unit]; ok {
		if state, has := spells[spellID]; has {
			return state.Stacks
		}
	}
	return 0
}

// ActiveAuras returns all active auras for a unit (nil if none).
func (t *Tracking) ActiveAuras(unit guid.GUID) map[chrondbc.SpellID]*AuraState {
	return t.units[unit]
}
