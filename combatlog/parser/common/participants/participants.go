package participants

import (
	"context"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var _ characters.SetHook = (*Tracker)(nil)

type Tracker struct {
	Active map[guid.GUID]bool

	fightActive bool
	known       map[guid.GUID]struct{}
	dead        map[guid.GUID]struct{}
}

func New() *Tracker {
	return &Tracker{
		Active: make(map[guid.GUID]bool),
		known:  make(map[guid.GUID]struct{}),
		dead:   make(map[guid.GUID]struct{}),
	}
}

func (t *Tracker) ActivityChange(_ messages.Message, chars ...characters.Character) {
	for _, c := range chars {
		if c.IsActive() {
			t.Active[c.ID()] = true
		}
	}
}

func (t *Tracker) CharacterAdded(messages.Message, ...characters.Character) {}

func (t *Tracker) FightStarted(_ uuid.UUID, m messages.Message) {
	t.fightActive = true
	clear(t.known)
	clear(t.dead)
	t.observe(m)
}

func (t *Tracker) FightEnded(uuid.UUID, messages.Message) {
	t.fightActive = false
}

func (t *Tracker) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if active && t.fightActive {
		t.observe(m)
	}
	return nil
}

func (t *Tracker) Finalize(context.Context) error {
	return nil
}

// NoKnownParticipantsAlive reports whether no player observed in the active fight is known alive.
func (t *Tracker) NoKnownParticipantsAlive() bool {
	return t.fightActive && len(t.known) > 0 && len(t.dead) == len(t.known)
}

func (t *Tracker) observe(m messages.Message) {
	for _, id := range m.Affects() {
		if !id.IsZero() && id.IsPlayer() {
			t.known[id] = struct{}{}
		}
	}

	switch event := m.(type) {
	case *messages.Damage:
		if event.Overkill > 0 && !event.Target.IsZero() && event.Target.IsPlayer() {
			t.dead[event.Target] = struct{}{}
		}
	case *messages.Slain:
		if !event.Victim.IsZero() && event.Victim.IsPlayer() {
			t.dead[event.Victim] = struct{}{}
		}
	case *messages.Resurrection:
		if !event.Target.IsZero() && event.Target.IsPlayer() {
			delete(t.dead, event.Target)
		}
	}
}
