package state

import (
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"
)

var (
	ParticipantTimeout = 5 * time.Minute
)

type Fights struct {
	Logger *slog.Logger
	s      *State

	Fights       []*Fight
	CurrentFight *Fight
}

func NewFights(s *State) *Fights {
	current := NewFight(s.logger, s)
	return &Fights{
		Logger:       s.logger,
		s:            s,
		CurrentFight: current,
		Fights: []*Fight{
			current,
		},
	}
}

func (fs *Fights) Process(m messages.Message) error {
	err := fs.CurrentFight.Process(m)
	if err != nil {
		return err
	}

	// TODO: Timeout

	// Always have a fight started. The start time will start on the first
	// damage. But start collecting participants & units right away.
	if fs.CurrentFight.IsDone() {
		fs.CurrentFight = NewFight(fs.Logger, fs.s)
		fs.Fights = append(fs.Fights, fs.CurrentFight)
	}

	return nil
}

type Fight struct {
	Logger *slog.Logger

	Participants *Combatants
	Units        *Units

	DamageDone  map[guid.GUID]int64
	DamageTaken map[guid.GUID]int64

	CurrentZone zone.Zone

	Start messages.Message
	End   messages.Message
}

func NewFight(logger *slog.Logger, s *State) *Fight {
	return &Fight{
		Logger:       logger,
		Participants: NewCombatants(s.Participants),
		Units:        NewUnits(s.Units),
		DamageDone:   make(map[guid.GUID]int64),
		DamageTaken:  make(map[guid.GUID]int64),
		CurrentZone:  s.CurrentZone,
	}
}

func (f *Fight) Process(m messages.Message) error {
	switch typed := m.(type) {
	case messages.Zone:
		f.Zone(typed)
	case messages.Damage:
		f.Damage(typed)
	case messages.Cast:
		//s.CastV2(typed)
	case messages.Combatant:
		f.Combatant(typed)
	case messages.Unit:
		f.Unit(typed)
	case messages.Slain:
		f.Slain(typed)
	}
	//if s.CurrentFight != nil {
	//  s.CurrentFight.CheckDone(m.Date())
	//  if s.CurrentFight.IsDone() {
	//    s.CurrentFight = nil
	//  }
	//}
	return nil
}

func (f *Fight) Started() bool {
	return f.Start != nil
}

func (f *Fight) IsDone() bool {
	return f.End != nil
}

func (f *Fight) Combatant(c messages.Combatant) {
	f.Participants.Seen(c.Combatant)
}

func (f *Fight) Damage(d messages.Damage) {
	// Mark units as seen
	f.Units.Seen(d.Date(), d.Caster, d.Target)

	f.DamageDone[d.Caster] += int64(d.Amount)
	f.DamageTaken[d.Target] += int64(d.Amount)
	f.StartFight(d)
}

func (f *Fight) Unit(u messages.Unit) {
	f.Units.NewInfo(u.Info)
}

func (f *Fight) Zone(z messages.Zone) {
	if f.CurrentZone.Equal(z.Zone) {
		return
	}

	// Zone changes end the fight
	f.EndFight(z)
}

func (f *Fight) StartFight(msg messages.Message) {
	if f.Start != nil {
		return // Fight already started
	}
	f.Start = msg
	f.Logger.Info("fight started",
		slog.Time("date", msg.Date()),
		slog.String("zone", f.CurrentZone.Name),
	)
}

func (f *Fight) EndFight(msg messages.Message) {
	if f.End != nil {
		return // Fight is already over
	}

	var dur time.Duration
	if f.Started() {
		dur = msg.Date().Sub(f.Start.Date())
	}
	f.End = msg
	f.Logger.Info("fight ended",
		slog.Duration("duration", dur),
		slog.Time("date", msg.Date()),
		slog.String("zone", f.CurrentZone.Name),
	)
}

func (f *Fight) Slain(slain messages.Slain) {
	f.Units.Slain(slain.Date(), slain.Victim)

	if f.Started() && f.Units.OnlyFriendlyActive() {
		f.EndFight(slain)
	}
}
