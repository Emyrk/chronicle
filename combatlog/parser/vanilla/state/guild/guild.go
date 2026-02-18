package guild

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type Tracker struct {
	Guilds      map[string]map[guid.GUID]struct{}
	Participant map[guid.GUID]struct{}
}

func New() *Tracker {
	return &Tracker{
		Guilds:      make(map[string]map[guid.GUID]struct{}),
		Participant: make(map[guid.GUID]struct{}),
	}
}

func (g *Tracker) Process(msg messages.Message) error {
	switch ty := msg.(type) {
	case *messages.Damage:
		if ty.Caster != nil && (*ty.Caster).IsPlayer() {
			g.Participant[*ty.Caster] = struct{}{}
		}
	case *messages.Heal:
		if ty.Caster.IsPlayer() {
			g.Participant[ty.Caster] = struct{}{}
		}
	case *messages.Combatant:
		if ty.Guild == nil {
			return nil
		}
		if ty.Guid.IsZero() || !ty.Guid.IsPlayer() {
			return nil
		}
		if ty.Guild.Name == "" {
			return nil
		}
		if _, ok := g.Participant[ty.Guid]; !ok {
			return nil
		}
		if _, ok := g.Guilds[ty.Guild.Name]; !ok {
			g.Guilds[ty.Guild.Name] = make(map[guid.GUID]struct{})
		}
		g.Guilds[ty.Guild.Name][ty.Guid] = struct{}{}
	}

	return nil
}
