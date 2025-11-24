package vanillaparser

import (
	"fmt"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
)

type Fights struct {
	CurrentFight *Fight
	Fights       []*Fight
}

func NewFights() *Fights {
	return &Fights{
		Fights: []*Fight{},
	}
}

func (f *Fights) Process(msg Message) error {
	switch typed := msg.(type) {
	case Damage:
		if f.CurrentFight == nil && typed.Caster.IsPlayer() && !typed.Target.IsPlayer() {
			f.StartFight()
		}
	}

	if f.CurrentFight == nil {
		return nil
	}

	err := f.CurrentFight.Process(msg)
	if err != nil {
		return fmt.Errorf("fight process: %w", err)
	}

	if len(f.CurrentFight.EnemiesAlive) == 0 {
		f.EndFight()
	}

	return nil
}

func (f *Fights) EndFight() {
	f.CurrentFight = nil
}

func (f *Fights) StartFight() {
	ft := NewFight()
	f.CurrentFight = ft
	f.Fights = append(f.Fights, ft)
}

// Fight represents a start & end of combat.
type Fight struct {
	// Players is a map of the players and their last message of activity
	Players map[guid.GUID]Message
	// Enemies is a map of the enemies and their last message of activity
	Enemies map[guid.GUID]Message

	// Who is alive
	PlayersAlive map[guid.GUID]struct{}
	EnemiesAlive map[guid.GUID]struct{}
}

func NewFight() *Fight {
	return &Fight{
		Players:      make(map[guid.GUID]Message),
		Enemies:      make(map[guid.GUID]Message),
		PlayersAlive: make(map[guid.GUID]struct{}),
		EnemiesAlive: make(map[guid.GUID]struct{}),
	}
}

func (f *Fight) Process(msg Message) error {
	switch m := msg.(type) {
	case Damage:
		f.Damage(m)
	case Slain:
		f.Slain(m)
	}

	return nil
}

func (f *Fight) Damage(dmg Damage) {
	f.seen(dmg.Caster, dmg)
}

func (f *Fight) Slain(slain Slain) {
	if slain.Victim.IsPlayer() {
		delete(f.PlayersAlive, slain.Victim)
	} else {
		delete(f.EnemiesAlive, slain.Victim)
	}
}

func (f *Fight) seen(guid guid.GUID, msg Message) {
	if !guid.IsPlayer() {
		f.EnemiesAlive[guid] = struct{}{}
		f.Enemies[guid] = msg
		return
	}
	f.PlayersAlive[guid] = struct{}{}
	f.Players[guid] = msg
}
