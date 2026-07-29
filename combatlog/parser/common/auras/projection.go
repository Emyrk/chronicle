package auras

import (
	"context"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/google/uuid"
)

var (
	_ instancehook.Hook  = (*Projection)(nil)
	_ characters.SetHook = (*Projection)(nil)
)

// Projection is a lightweight instance-level adapter that references the shared
// parse-wide Tracking. It projects active auras into encounter event streams on
// FightStarted and forwards death notifications to the tracker. It never
// processes aura messages itself; all tracking happens in the shared Tracking.
type Projection struct {
	instancehook.BaseHook

	tracker        *Tracking
	emit           func(*messages.Aura)
	encounterStart func() time.Time
}

// NewProjection creates a new instance-level projection adapter that references
// the shared parse-wide tracker.
func NewProjection(tracker *Tracking, encounterStart func() time.Time) *Projection {
	return &Projection{
		tracker:        tracker,
		encounterStart: encounterStart,
	}
}

// SetEmit sets the callback used to inject synthetic aura messages into the
// active fight's event stream.
func (p *Projection) SetEmit(fn func(*messages.Aura)) {
	p.emit = fn
}

// ProcessMessage is a no-op for the projection adapter. Aura tracking is
// handled by the shared parse-wide Tracking.
func (p *Projection) ProcessMessage(_ bool, _ uuid.UUID, _ messages.Message) error {
	return nil
}

// FightStarted expires stale auras in the shared tracker and projects all
// active auras into the encounter's event stream as synthetic "added" messages.
// This uses the encounter start timestamp as the event zero for projected
// auras. The projection does not mutate shared state beyond expiry.
func (p *Projection) FightStarted(_ uuid.UUID, m messages.Message) {
	start := m.Date()
	if p.encounterStart != nil && !p.encounterStart().IsZero() {
		start = p.encounterStart()
	}
	p.tracker.ExpireStale(start)
	if p.emit == nil {
		return
	}
	for _, auraMsg := range p.tracker.ProjectAllAuras(start) {
		p.emit(auraMsg)
	}
}

// FightEnded expires stale auras when an encounter ends.
func (p *Projection) FightEnded(_ uuid.UUID, m messages.Message) {
	p.tracker.ExpireStale(m.Date())
}

// Finalize is a no-op for the projection adapter. The shared tracker is
// finalized once at the parse level, not per instance.
func (p *Projection) Finalize(_ context.Context) error {
	return nil
}

// ActivityChange delegates death-clearing to the shared tracker.
func (p *Projection) ActivityChange(m messages.Message, chars ...characters.Character) {
	for _, char := range chars {
		if !char.IsActive() {
			pd, ok := char.CurrentPeriod()
			if ok && pd.EndState == period.EndStateSlain {
				p.tracker.ClearOnDeath(char.ID(), m.Date())
			}
		}
	}
}

// CharacterAdded is a no-op.
func (p *Projection) CharacterAdded(_ messages.Message, _ ...characters.Character) {}
