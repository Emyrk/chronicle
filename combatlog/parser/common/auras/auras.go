package auras

import (
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// NotificationType describes the lifecycle event for an aura change.
type NotificationType int

const (
	// NotifyAdded is emitted when an aura is applied to a unit for the first time.
	NotifyAdded NotificationType = iota + 1
	// NotifyRefreshed is emitted when an existing aura is re-applied, resetting
	// its duration.
	NotifyRefreshed
	// NotifyStackChanged is emitted when only the stack count changes (no
	// duration extension).
	NotifyStackChanged
	// NotifyRemoved is emitted when an aura is explicitly removed (combat log
	// AURA_REMOVED).
	NotifyRemoved
	// NotifyExpired is emitted when an aura's maximum possible duration elapses
	// without a matching AURA_REMOVED.
	NotifyExpired
	// NotifyRemovedOnDeath is emitted when a non-death-persistent aura is
	// cleared because the unit died.
	NotifyRemovedOnDeath
)

// Notification describes a single aura lifecycle change. Subscribers receive
// these via the Observer callback.
type Notification struct {
	Type      NotificationType
	Unit      guid.GUID
	SpellID   chrondbc.SpellID
	SpellName string
	Spell     *chrondbc.Spell
	Stacks    int32
	Timestamp time.Time
}

// Observer is the callback type for aura lifecycle notifications.
type Observer func(Notification)

// AuraState holds the current stack count for an aura.
type AuraState struct {
	Buff          bool
	Stacks        int32
	AppliedAt     time.Time
	LastUpdatedAt time.Time
	// Beyond this time, the aura can no longer exist. A zero value means the
	// spell has no finite duration Chronicle can safely infer.
	MaxExistsUntil time.Time
	SpellID        chrondbc.SpellID
	SpellName      string
	Spell          *chrondbc.Spell // retained for attribute checks (e.g. death persistence)
}

// Tracking is a parse-wide aura tracker. It processes every aura message once,
// regardless of which instance (if any) is active, and emits typed lifecycle
// notifications. Instance-level hooks should project from the shared state
// rather than running their own tracker.
type Tracking struct {
	// units maps GUID -> spell -> aura state
	units map[guid.GUID]map[chrondbc.SpellID]*AuraState
	// mods is loaded once per parse job and passed to MaxAuraDuration.
	// nil is a safe fallback when no dataset modifier plumbing is available.
	mods *chrondbc.DurationModifierSet
	// observers receive lifecycle notifications.
	observers []Observer
}

// New creates a parse-wide aura tracker. mods may be nil when duration modifier
// data is not available (the tracker falls back to base spell durations).
func New(mods *chrondbc.DurationModifierSet) *Tracking {
	return &Tracking{
		units: make(map[guid.GUID]map[chrondbc.SpellID]*AuraState),
		mods:  mods,
	}
}

// SetDurationModifiers installs the dataset-scoped duration modifiers for this
// parse. Call before processing messages.
func (t *Tracking) SetDurationModifiers(mods *chrondbc.DurationModifierSet) {
	t.mods = mods
}

// AddObserver registers a lifecycle notification callback. Observers are called
// synchronously in registration order.
func (t *Tracking) AddObserver(fn Observer) {
	t.observers = append(t.observers, fn)
}

func (t *Tracking) notify(n Notification) {
	for _, fn := range t.observers {
		fn(n)
	}
}

// Process handles a single message at the parse level. It ignores synthetic
// messages (those not sourced from the original combat log) to avoid feedback
// loops from projection.
func (t *Tracking) Process(m messages.Message) {
	if m.IsSynthetic() {
		return
	}
	msg, ok := m.(*messages.Aura)
	if !ok || msg.SpellData == nil {
		return
	}
	switch msg.State {
	case types.AuraStateAdded, types.AuraStateModified:
		t.applyAura(msg)
	case types.AuraStateRemoved:
		t.removeAura(msg)
	}
}

func (t *Tracking) applyAura(msg *messages.Aura) {
	if _, ok := t.units[msg.Target]; !ok {
		t.units[msg.Target] = make(map[chrondbc.SpellID]*AuraState)
	}
	state, exists := t.units[msg.Target][msg.SpellData.ID]
	if !exists {
		state = &AuraState{}
		t.units[msg.Target][msg.SpellData.ID] = state
		state.Buff = msg.IsBuff
		state.Stacks = msg.Amount
		state.AppliedAt = msg.Date()
		state.LastUpdatedAt = msg.Date()
		state.SpellID = msg.SpellData.ID
		state.SpellName = msg.SpellName
		state.Spell = msg.SpellData
		state.MaxExistsUntil = maximumExpiry(msg.Date(), msg.SpellData, t.mods)
		t.notify(Notification{
			Type:      NotifyAdded,
			Unit:      msg.Target,
			SpellID:   msg.SpellData.ID,
			SpellName: msg.SpellName,
			Spell:     msg.SpellData,
			Stacks:    msg.Amount,
			Timestamp: msg.Date(),
		})
		return
	}

	state.Buff = msg.IsBuff
	state.Stacks = msg.Amount
	state.LastUpdatedAt = msg.Date()
	state.SpellID = msg.SpellData.ID
	state.SpellName = msg.SpellName
	state.Spell = msg.SpellData

	transition := msg.Transition
	if transition == messages.AuraTransitionUnknown {
		// Backward-compatible fallback for parsers without explicit transition
		// metadata, such as the 1.12a CC addon parser.
		if msg.State == types.AuraStateModified {
			transition = messages.AuraTransitionStackChanged
		} else {
			transition = messages.AuraTransitionRefreshed
		}
	}

	if transition == messages.AuraTransitionStackChanged {
		t.notify(Notification{
			Type:      NotifyStackChanged,
			Unit:      msg.Target,
			SpellID:   msg.SpellData.ID,
			SpellName: msg.SpellName,
			Spell:     msg.SpellData,
			Stacks:    msg.Amount,
			Timestamp: msg.Date(),
		})
		return
	}

	// A real refresh or re-application resets the maximum duration.
	state.AppliedAt = msg.Date()
	state.MaxExistsUntil = maximumExpiry(msg.Date(), msg.SpellData, t.mods)
	t.notify(Notification{
		Type:      NotifyRefreshed,
		Unit:      msg.Target,
		SpellID:   msg.SpellData.ID,
		SpellName: msg.SpellName,
		Spell:     msg.SpellData,
		Stacks:    msg.Amount,
		Timestamp: msg.Date(),
	})
}

func maximumExpiry(appliedAt time.Time, spell *chrondbc.Spell, mods *chrondbc.DurationModifierSet) time.Time {
	duration := chrondbc.MaxAuraDuration(spell, mods)
	if duration <= 0 {
		return time.Time{}
	}
	return appliedAt.Add(duration)
}

func (t *Tracking) removeAura(msg *messages.Aura) {
	if spells, ok := t.units[msg.Target]; ok {
		if _, exists := spells[msg.SpellData.ID]; !exists {
			return
		}
		delete(spells, msg.SpellData.ID)
		if len(spells) == 0 {
			delete(t.units, msg.Target)
		}
		t.notify(Notification{
			Type:      NotifyRemoved,
			Unit:      msg.Target,
			SpellID:   msg.SpellData.ID,
			SpellName: msg.SpellName,
			Spell:     msg.SpellData,
			Stacks:    msg.Amount,
			Timestamp: msg.Date(),
		})
	}
}

// ExpireStale removes auras whose maximum possible duration has elapsed and
// emits NotifyExpired for each.
func (t *Tracking) ExpireStale(now time.Time) {
	for _, unitGUID := range t.sortedUnits() {
		spells := t.units[unitGUID]
		for _, spellID := range sortedSpellIDs(spells) {
			state := spells[spellID]
			if !state.MaxExistsUntil.IsZero() && now.After(state.MaxExistsUntil) {
				delete(spells, spellID)
				t.notify(Notification{
					Type:      NotifyExpired,
					Unit:      unitGUID,
					SpellID:   state.SpellID,
					SpellName: state.SpellName,
					Spell:     state.Spell,
					Stacks:    state.Stacks,
					Timestamp: now,
				})
			}
		}
		if len(spells) == 0 {
			delete(t.units, unitGUID)
		}
	}
}

// ClearOnDeath removes non-death-persistent auras for a unit that died and
// emits NotifyRemovedOnDeath for each cleared aura.
func (t *Tracking) ClearOnDeath(unit guid.GUID, deathTime time.Time) {
	spells, ok := t.units[unit]
	if !ok {
		return
	}
	for _, id := range sortedSpellIDs(spells) {
		state := spells[id]
		if state.Spell == nil || !state.Spell.Attrs.Has(chrondbc.AttrEx3_DeathPersistent) {
			delete(spells, id)
			t.notify(Notification{
				Type:      NotifyRemovedOnDeath,
				Unit:      unit,
				SpellID:   state.SpellID,
				SpellName: state.SpellName,
				Spell:     state.Spell,
				Stacks:    state.Stacks,
				Timestamp: deathTime,
			})
		}
	}
	if len(spells) == 0 {
		delete(t.units, unit)
	}
}

// Finalize clears all tracked state. Call once at the end of a parse.
func (t *Tracking) Finalize() {
	t.units = make(map[guid.GUID]map[chrondbc.SpellID]*AuraState)
}

// --- Projection helpers ---

// SnapshotAll returns a deep copy of all tracked aura state. The caller owns
// the returned map and may read it without holding any lock. This is used by
// Projection to capture pre-message canonical state.
func (t *Tracking) SnapshotAll() map[guid.GUID]map[chrondbc.SpellID]*AuraState {
	result := make(map[guid.GUID]map[chrondbc.SpellID]*AuraState, len(t.units))
	for unit, spells := range t.units {
		snap := make(map[chrondbc.SpellID]*AuraState, len(spells))
		for id, state := range spells {
			copy := *state
			snap[id] = &copy
		}
		result[unit] = snap
	}
	return result
}

// ProjectAllAuras returns synthetic aura "added" messages for every tracked
// aura, timestamped at ts. The caller owns these messages and may inject them
// into an encounter event stream. This does NOT mutate shared state.
func (t *Tracking) ProjectAllAuras(ts time.Time) []*messages.Aura {
	var out []*messages.Aura
	for _, unitGUID := range t.sortedUnits() {
		spells := t.units[unitGUID]
		for _, spellID := range sortedSpellIDs(spells) {
			aura := spells[spellID]
			out = append(out, &messages.Aura{
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
	return out
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

// ActiveAuras returns a snapshot of the active auras for a unit (nil if none).
func (t *Tracking) ActiveAuras(unit guid.GUID) map[chrondbc.SpellID]*AuraState {
	spells := t.units[unit]
	if spells == nil {
		return nil
	}
	result := make(map[chrondbc.SpellID]*AuraState, len(spells))
	for id, state := range spells {
		copy := *state
		result[id] = &copy
	}
	return result
}

func (t *Tracking) sortedUnits() []guid.GUID {
	units := make([]guid.GUID, 0, len(t.units))
	for unit := range t.units {
		units = append(units, unit)
	}
	slices.Sort(units)
	return units
}

func sortedSpellIDs(spells map[chrondbc.SpellID]*AuraState) []chrondbc.SpellID {
	ids := make([]chrondbc.SpellID, 0, len(spells))
	for id := range spells {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids
}
