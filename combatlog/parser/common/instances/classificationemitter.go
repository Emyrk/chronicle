package instances

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/google/uuid"
)

// Verify interface compliance.
var _ instancehook.Hook = (*ClassificationEmitter)(nil)
var _ characters.SetHook = (*ClassificationEmitter)(nil)

// ClassificationEmitter injects UnitClassificationEvent messages into the
// current fight's event builder when unit affiliations change.
type ClassificationEmitter struct {
	instancehook.BaseHook

	units      *unitdb.Units
	characters *characters.Characters
	emit       func(*messages.UnitClassificationEvent)
}

// characters.SetHook — fires when a character becomes active or inactive.
func (ce *ClassificationEmitter) ActivityChange(m messages.Message, chars ...characters.Character) {
	for _, c := range chars {
		ce.emitClassification(c.ID(), m)
	}
}

// characters.SetHook — no-op.
func (ce *ClassificationEmitter) CharacterAdded(_ messages.Message, _ ...characters.Character) {}

// instancehook.Hook — detect possession changes.
func (ce *ClassificationEmitter) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	switch msg := m.(type) {
	case *messages.PossessionChange:
		ce.emitClassification(msg.Target, m)
	case *messages.NewOwner:
		ce.emitClassification(msg.Target, m)
	}
	return nil
}

// instancehook.Hook
func (ce *ClassificationEmitter) Finalize(_ context.Context) error { return nil }

// instancehook.Hook — classify all active characters when a fight starts.
func (ce *ClassificationEmitter) FightStarted(_ uuid.UUID, m messages.Message) {
	ce.emitAllActive(m)
}

// instancehook.Hook — classify all active characters when a fight ends.
func (ce *ClassificationEmitter) FightEnded(_ uuid.UUID, m messages.Message) {
	ce.emitAllActive(m)
}

func (ce *ClassificationEmitter) emitClassification(target guid.GUID, m messages.Message) {
	c := ce.units.Classify(target)
	evt := &messages.UnitClassificationEvent{
		MessageBase: messages.Base(m.Date()),
		Target:      target,
		UnitType:    c.Type,
		Affiliation: c.Affiliation,
	}
	if c.Relation.HasOwner() {
		evt.Owner = c.Relation.Owner
	}
	if c.Possession != nil {
		evt.Controller = &c.Possession.Controller
		evt.Spell = c.Possession.Spell
	}
	ce.emit(evt)
}

func (ce *ClassificationEmitter) emitAllActive(m messages.Message) {
	_ = ce.characters.All.ForEach(func(char characters.Character) error {
		if char.IsActive() {
			ce.emitClassification(char.ID(), m)
		}
		return nil
	})
}
