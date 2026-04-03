package instances

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/character"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/google/uuid"
)

// Verify interface compliance.
var _ instancehook.Hook = (*classificationEmitter)(nil)
var _ character.SetHook = (*classificationEmitter)(nil)

// classificationEmitter injects UnitClassificationEvent messages into the
// current fight's event builder when unit affiliations change.
type classificationEmitter struct {
	instancehook.BaseHook

	units      *unitdb.Units
	characters *character.Characters
	emit       func(*messages.UnitClassificationEvent)
}

// character.SetHook — fires when a character becomes active or inactive.
func (ce *classificationEmitter) ActivityChange(m messages.Message, chars ...character.Character) {
	for _, c := range chars {
		ce.emitClassification(c.ID(), m)
	}
}

// character.SetHook — no-op.
func (ce *classificationEmitter) CharacterAdded(_ messages.Message, _ ...character.Character) {}

// instancehook.Hook — detect possession changes.
func (ce *classificationEmitter) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	switch msg := m.(type) {
	case *messages.PossessionChange:
		ce.emitClassification(msg.Target, m)
	case *messages.NewOwner:
		ce.emitClassification(msg.Target, m)
	}
	return nil
}

// instancehook.Hook
func (ce *classificationEmitter) Finalize(_ context.Context) error { return nil }

// instancehook.Hook — classify all active characters when a fight starts.
func (ce *classificationEmitter) FightStarted(_ uuid.UUID, m messages.Message) {
	ce.emitAllActive(m)
}

// instancehook.Hook — classify all active characters when a fight ends.
func (ce *classificationEmitter) FightEnded(_ uuid.UUID, m messages.Message) {
	ce.emitAllActive(m)
}

func (ce *classificationEmitter) emitClassification(target guid.GUID, m messages.Message) {
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

func (ce *classificationEmitter) emitAllActive(m messages.Message) {
	_ = ce.characters.All.ForEach(func(char character.Character) error {
		if char.IsActive() {
			ce.emitClassification(char.ID(), m)
		}
		return nil
	})
}
