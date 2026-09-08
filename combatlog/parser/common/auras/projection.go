package auras

import (
	"context"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
)

var (
	_ instancehook.Hook  = (*Projection)(nil)
	_ characters.SetHook = (*Projection)(nil)
)

// projectedAuraKey uniquely identifies a projected aura for synthetic expiry.
type projectedAuraKey struct {
	Unit    guid.GUID
	SpellID chrondbc.SpellID
}

// projectedAura records a projected pre-pull aura that may need synthetic expiry.
type projectedAura struct {
	Key            projectedAuraKey
	Source         *guid.GUID
	Spell          *chrondbc.Spell
	SpellName      string
	Stacks         int32
	Buff           bool
	MaxExistsUntil time.Time
}

// Projection is a lightweight instance-level adapter that references the shared
// parse-wide Tracking. It projects active auras into encounter event streams
// on the first non-synthetic message after FightStarted, and manages synthetic
// expiry for projected auras that receive no real in-combat evidence. It never
// processes aura messages itself; all tracking happens in the shared Tracking.
type Projection struct {
	instancehook.BaseHook

	tracker *Tracking
	emit    func(*messages.Aura)

	// pendingProjection is true between FightStarted and the first non-synthetic
	// ProcessMessage. During this window the tracker snapshot is captured but
	// not yet emitted.
	pendingProjection bool
	// snapshot holds the tracker state captured at FightStarted, before the
	// pull-starting message updates canonical state.
	snapshot map[guid.GUID]map[chrondbc.SpellID]*AuraState

	// projectedAuras tracks auras that were projected at encounter start and
	// may need synthetic expiry. Keyed by target+spell.
	projectedAuras map[projectedAuraKey]*projectedAura
}

// NewProjection creates a new instance-level projection adapter that references
// the shared parse-wide tracker.
func NewProjection(tracker *Tracking) *Projection {
	return &Projection{
		tracker: tracker,
	}
}

// SetEmit sets the callback used to inject synthetic aura messages into the
// active fight's event stream.
func (p *Projection) SetEmit(fn func(*messages.Aura)) {
	p.emit = fn
}

// ProcessMessage handles projection and synthetic expiry on each real message.
// On the first non-synthetic message after FightStarted it emits projected
// auras. Before each subsequent real message it emits synthetic removals for
// expired projected auras.
func (p *Projection) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if !active || m.IsSynthetic() {
		return nil
	}

	if p.pendingProjection {
		p.emitProjection(m)
		p.pendingProjection = false
	}

	// Real aura evidence is authoritative. Cancel inferred expiry ownership
	// before checking timestamps so a late refresh/removal never receives a
	// synthetic fade immediately ahead of its real event.
	p.cancelOnRealEvidence(m)

	// Emit synthetic expiry only for projected auras that remain untouched by
	// real in-combat aura evidence.
	p.emitSyntheticExpiries(m)

	return nil
}

// FightStarted snapshots the tracker state and marks projection as pending.
// The actual projection is deferred until the first non-synthetic message.
func (p *Projection) FightStarted(_ uuid.UUID, m messages.Message) {
	p.tracker.ExpireStale(m.Date())
	p.snapshot = p.tracker.SnapshotAll()
	p.pendingProjection = true
	p.projectedAuras = nil
}

// FightEnded expires stale auras and clears per-encounter projected state.
func (p *Projection) FightEnded(_ uuid.UUID, m messages.Message) {
	p.tracker.ExpireStale(m.Date())
	p.clearEncounterState()
}

// Finalize clears per-encounter projected state.
func (p *Projection) Finalize(_ context.Context) error {
	p.clearEncounterState()
	return nil
}

// ActivityChange delegates death-clearing to the shared tracker.
func (p *Projection) ActivityChange(m messages.Message, chars ...characters.Character) {
	for _, char := range chars {
		if !char.IsActive() {
			pd, ok := char.CurrentPeriod()
			if ok && pd.EndState == period.EndStateSlain {
				p.handleDeath(char.ID(), m.Date())
			}
		}
	}
}

// handleDeath clears canonical non-persistent auras and cancels encounter-local
// projection state for the dead unit. The slain event already clears frontend
// aura state, so later synthetic expiry removals would be redundant.
func (p *Projection) handleDeath(unit guid.GUID, deathTime time.Time) {
	delete(p.snapshot, unit)
	for key := range p.projectedAuras {
		if key.Unit == unit {
			delete(p.projectedAuras, key)
		}
	}
	p.tracker.ClearOnDeath(unit, deathTime)
}

// CharacterAdded is a no-op.
func (p *Projection) CharacterAdded(_ messages.Message, _ ...characters.Character) {}

// emitProjection projects pre-pull auras from the snapshot at the first real
// message's timestamp. It skips auras that match the first real message if it
// is an aura apply/refresh/stack event (to avoid duplicates).
func (p *Projection) emitProjection(firstReal messages.Message) {
	if p.emit == nil || p.snapshot == nil {
		p.snapshot = nil
		return
	}

	ts := firstReal.Date()

	// Detect if the first real message is an aura lifecycle event for dedup.
	var skipKey *projectedAuraKey
	if auraMsg, ok := firstReal.(*messages.Aura); ok && auraMsg.SpellData != nil {
		if auraMsg.State == types.AuraStateAdded || auraMsg.State == types.AuraStateModified {
			skipKey = &projectedAuraKey{Unit: auraMsg.Target, SpellID: auraMsg.SpellData.ID}
		}
	}

	p.projectedAuras = make(map[projectedAuraKey]*projectedAura)

	for _, unitGUID := range sortedGUIDs(p.snapshot) {
		spells := p.snapshot[unitGUID]
		for _, spellID := range sortedSpellIDsFromSnapshot(spells) {
			aura := spells[spellID]
			key := projectedAuraKey{Unit: unitGUID, SpellID: spellID}

			// Skip if the first real message is an apply/refresh for this exact aura.
			if skipKey != nil && *skipKey == key {
				continue
			}

			p.emit(&messages.Aura{
				MessageBase: messages.Base(ts, messages.WithSynthetic()),
				IsBuff:      aura.Buff,
				Source:      cloneGUID(aura.Source),
				Target:      unitGUID,
				SpellName:   aura.SpellName,
				SpellData:   aura.Spell,
				Amount:      aura.Stacks,
				State:       types.AuraStateAdded,
			})

			// Record for synthetic expiry if finite duration that extends past encounter start.
			if !aura.MaxExistsUntil.IsZero() && aura.MaxExistsUntil.After(ts) {
				p.projectedAuras[key] = &projectedAura{
					Key:            key,
					Source:         cloneGUID(aura.Source),
					Spell:          aura.Spell,
					SpellName:      aura.SpellName,
					Stacks:         aura.Stacks,
					Buff:           aura.Buff,
					MaxExistsUntil: aura.MaxExistsUntil,
				}
			}
		}
	}

	p.snapshot = nil
}

// emitSyntheticExpiries emits synthetic AuraStateRemoved for projected auras
// whose MaxExistsUntil is <= the current message timestamp.
func (p *Projection) emitSyntheticExpiries(m messages.Message) {
	if p.emit == nil || len(p.projectedAuras) == 0 {
		return
	}

	now := m.Date()
	// Collect expired keys in deterministic order.
	var expired []projectedAuraKey
	for key, pa := range p.projectedAuras {
		if !pa.MaxExistsUntil.After(now) {
			expired = append(expired, key)
		}
	}
	slices.SortFunc(expired, func(a, b projectedAuraKey) int {
		// Sort by expiry time, then unit, then spell for determinism.
		pa, pb := p.projectedAuras[a], p.projectedAuras[b]
		if !pa.MaxExistsUntil.Equal(pb.MaxExistsUntil) {
			if pa.MaxExistsUntil.Before(pb.MaxExistsUntil) {
				return -1
			}
			return 1
		}
		if a.Unit != b.Unit {
			if a.Unit < b.Unit {
				return -1
			}
			return 1
		}
		if a.SpellID != b.SpellID {
			if a.SpellID < b.SpellID {
				return -1
			}
			return 1
		}
		return 0
	})

	for _, key := range expired {
		pa := p.projectedAuras[key]
		p.emit(&messages.Aura{
			MessageBase: messages.Base(pa.MaxExistsUntil, messages.WithSynthetic()),
			IsBuff:      pa.Buff,
			Source:      cloneGUID(pa.Source),
			Target:      pa.Key.Unit,
			SpellName:   pa.SpellName,
			SpellData:   pa.Spell,
			Amount:      0,
			State:       types.AuraStateRemoved,
		})
		delete(p.projectedAuras, key)
	}
}

// cancelOnRealEvidence cancels synthetic expiry for projected auras that
// receive real aura lifecycle evidence.
func (p *Projection) cancelOnRealEvidence(m messages.Message) {
	if len(p.projectedAuras) == 0 {
		return
	}
	auraMsg, ok := m.(*messages.Aura)
	if !ok || auraMsg.SpellData == nil {
		return
	}
	key := projectedAuraKey{Unit: auraMsg.Target, SpellID: auraMsg.SpellData.ID}
	delete(p.projectedAuras, key)
}

// clearEncounterState resets all per-encounter projection state.
func (p *Projection) clearEncounterState() {
	p.pendingProjection = false
	p.snapshot = nil
	p.projectedAuras = nil
}

// sortedGUIDs returns sorted keys from a snapshot map.
func sortedGUIDs(m map[guid.GUID]map[chrondbc.SpellID]*AuraState) []guid.GUID {
	units := make([]guid.GUID, 0, len(m))
	for unit := range m {
		units = append(units, unit)
	}
	slices.Sort(units)
	return units
}

// sortedSpellIDsFromSnapshot returns sorted spell IDs from a snapshot entry.
func sortedSpellIDsFromSnapshot(m map[chrondbc.SpellID]*AuraState) []chrondbc.SpellID {
	return sortedSpellIDs(m)
}
