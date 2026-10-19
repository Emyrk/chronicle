package instances

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
)

var _ instancehook.Hook = (*UnitTelemetryEmitter)(nil)
var _ characters.SetHook = (*UnitTelemetryEmitter)(nil)

// UnitTelemetryEmitter keeps the latest position and resource snapshots so a
// fight can begin with telemetry for players and newly active characters.
type UnitTelemetryEmitter struct {
	instancehook.BaseHook

	characters *characters.Characters
	emit       func(messages.Message)

	positions map[guid.GUID]messages.UnitPosition
	resources map[guid.GUID]messages.UnitResources
	dead      map[guid.GUID]struct{}

	fightActive     bool
	emittedPosition map[guid.GUID]struct{}
	emittedResource map[guid.GUID]struct{}
}

func newUnitTelemetryEmitter(chars *characters.Characters) *UnitTelemetryEmitter {
	return &UnitTelemetryEmitter{
		characters:      chars,
		positions:       make(map[guid.GUID]messages.UnitPosition),
		resources:       make(map[guid.GUID]messages.UnitResources),
		dead:            make(map[guid.GUID]struct{}),
		emittedPosition: make(map[guid.GUID]struct{}),
		emittedResource: make(map[guid.GUID]struct{}),
	}
}

// ActivityChange emits the last known telemetry when a character becomes
// active during an existing fight.
func (e *UnitTelemetryEmitter) ActivityChange(m messages.Message, chars ...characters.Character) {
	if !e.fightActive {
		return
	}
	for _, char := range chars {
		if char.IsActive() {
			e.emitCached(char.ID(), m)
		} else {
			e.emitPositionEndpoint(char.ID(), m)
		}
	}
}

func (e *UnitTelemetryEmitter) CharacterAdded(_ messages.Message, _ ...characters.Character) {}

// ProcessMessage records real telemetry and remembers which values have
// already entered the current encounter stream.
func (e *UnitTelemetryEmitter) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	switch msg := m.(type) {
	case *messages.UnitPosition:
		if _, dead := e.dead[msg.Unit]; !dead {
			e.positions[msg.Unit] = *msg
		}
		if active {
			e.emittedPosition[msg.Unit] = struct{}{}
		}
	case *messages.UnitResources:
		if msg.CurrentHealth <= 0 {
			e.markDead(msg.Unit)
			break
		}
		delete(e.dead, msg.Unit)
		e.resources[msg.Unit] = cloneUnitResources(*msg)
		if active {
			e.emittedResource[msg.Unit] = struct{}{}
		}
	case *messages.Slain:
		e.markDead(msg.Victim)
	case *messages.Resurrection:
		delete(e.dead, msg.Target)
	}
	return nil
}

func (e *UnitTelemetryEmitter) Finalize(_ context.Context) error { return nil }

// FightStarted emits cached telemetry for every known living player and every
// character that is already active when the fight begins.
func (e *UnitTelemetryEmitter) FightStarted(_ uuid.UUID, m messages.Message) {
	e.fightActive = true
	clear(e.emittedPosition)
	clear(e.emittedResource)

	seen := make(map[guid.GUID]struct{})
	for id := range e.positions {
		if id.IsPlayer() {
			e.emitCachedOnce(id, m, seen)
		}
	}
	for id := range e.resources {
		if id.IsPlayer() {
			e.emitCachedOnce(id, m, seen)
		}
	}
	if e.characters == nil {
		return
	}
	_ = e.characters.All.ForEach(func(char characters.Character) error {
		if char.IsActive() {
			e.emitCachedOnce(char.ID(), m, seen)
		}
		return nil
	})
}

func (e *UnitTelemetryEmitter) FightEnded(_ uuid.UUID, _ messages.Message) {
	e.fightActive = false
}

func (e *UnitTelemetryEmitter) emitCachedOnce(id guid.GUID, m messages.Message, seen map[guid.GUID]struct{}) {
	if _, ok := seen[id]; ok {
		return
	}
	seen[id] = struct{}{}
	e.emitCached(id, m)
}

// emitPositionEndpoint closes a character's position track at the moment it
// becomes inactive. The map can then remove despawned guardians without
// treating a timeout/reset as a combat-log death.
func (e *UnitTelemetryEmitter) emitPositionEndpoint(id guid.GUID, trigger messages.Message) {
	_, wasEmitted := e.emittedPosition[id]
	delete(e.emittedPosition, id)
	delete(e.emittedResource, id)
	if e.emit == nil || !wasEmitted {
		return
	}
	if _, dead := e.dead[id]; dead {
		return
	}
	cached, ok := e.positions[id]
	if !ok {
		return
	}
	cached.MessageBase = messages.Base(trigger.Date(), messages.WithSynthetic())
	e.emit(&cached)
}

func (e *UnitTelemetryEmitter) emitCached(id guid.GUID, trigger messages.Message) {
	if e.emit == nil {
		return
	}
	if _, dead := e.dead[id]; dead {
		return
	}

	if _, emitted := e.emittedPosition[id]; !emitted && !isUnitPositionFor(trigger, id) {
		if cached, ok := e.positions[id]; ok {
			cached.MessageBase = messages.Base(trigger.Date(), messages.WithSynthetic())
			e.emit(&cached)
			e.emittedPosition[id] = struct{}{}
		}
	}
	if _, emitted := e.emittedResource[id]; !emitted && !isUnitResourcesFor(trigger, id) {
		if cached, ok := e.resources[id]; ok {
			cached.MessageBase = messages.Base(trigger.Date(), messages.WithSynthetic())
			copy := cloneUnitResources(cached)
			e.emit(&copy)
			e.emittedResource[id] = struct{}{}
		}
	}
}

func (e *UnitTelemetryEmitter) markDead(id guid.GUID) {
	e.dead[id] = struct{}{}
	delete(e.positions, id)
	delete(e.resources, id)
}

func isUnitPositionFor(m messages.Message, id guid.GUID) bool {
	position, ok := m.(*messages.UnitPosition)
	return ok && position.Unit == id
}

func isUnitResourcesFor(m messages.Message, id guid.GUID) bool {
	resources, ok := m.(*messages.UnitResources)
	return ok && resources.Unit == id
}

func cloneUnitResources(resources messages.UnitResources) messages.UnitResources {
	if resources.UnitLevel != nil {
		level := *resources.UnitLevel
		resources.UnitLevel = &level
	}
	if resources.AverageItemLevel != nil {
		itemLevel := *resources.AverageItemLevel
		resources.AverageItemLevel = &itemLevel
	}
	return resources
}
