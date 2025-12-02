package state

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/unitinfo"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"
)

type Fights struct {
	Logger *slog.Logger
	s      *State

	Fights       []*Fight
	CurrentFight *Fight
}

func NewFights(s *State) *Fights {
	current := NewFight(s)
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
		fs.CurrentFight = NewFight(fs.s)
		fs.Fights = append(fs.Fights, fs.CurrentFight)
	}

	return nil
}

type Fight struct {
	Logger *slog.Logger
	s      *State // Reference to parent state

	// Units are all units seen in the fight.
	Units map[guid.GUID]unitinfo.Info

	// Active refers to units that is still "fighting". A unit can be considered
	// inactive by death or timeout.
	// TODO: portals too maybe? Like hearth
	FriendlyActive map[guid.GUID]time.Time
	EnemiesActive  map[guid.GUID]time.Time
	UnknownActive  map[guid.GUID]time.Time

	// Deaths are units that have died during the fight.
	Deaths map[guid.GUID]time.Time

	CurrentZone zone.Zone

	// Start & End of the fight
	Start messages.Message
	End   messages.Message
}

func NewFight(s *State) *Fight {
	return &Fight{
		Logger:         s.logger,
		s:              s,
		Units:          make(map[guid.GUID]unitinfo.Info),
		FriendlyActive: make(map[guid.GUID]time.Time),
		EnemiesActive:  make(map[guid.GUID]time.Time),
		UnknownActive:  make(map[guid.GUID]time.Time),
		Deaths:         make(map[guid.GUID]time.Time),
		CurrentZone:    s.CurrentZone,
	}
}

func (f *Fight) Process(m messages.Message) error {
	if f.IsDone() {
		return errors.New("fight is already done")
	}
	switch typed := m.(type) {
	case messages.Zone:
		f.Zone(typed)
	case messages.Damage:
		f.Damage(typed)
	case messages.FallDamage:
		//f.FallDamage(typed)
	case messages.Cast:
	//s.CastV2(typed)
	case messages.Heal:
		f.Heal(typed)
	case messages.Combatant:
		//f.Combatant(typed)
	case messages.Unit:
		//f.Unit(typed)
	case messages.Slain:
		f.Slain(typed)
	}

	return nil
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
	if f.Start == nil {
		f.Logger.Warn("attempted to end fight that hasn't started")
		return
	}
	if f.End != nil {
		f.Logger.Error("attempted to end fight that has already ended")
	}

	f.End = msg
	var dur time.Duration
	if f.IsStarted() {
		dur = msg.Date().Sub(f.Start.Date())
	}

	f.Logger.Info("fight ended",
		slog.Duration("duration", dur),
		slog.Time("date", msg.Date()),
		slog.String("zone", f.CurrentZone.Name),
	)
}

func (f *Fight) IsDone() bool {
	return f.End != nil && f.Start != nil
}

func (f *Fight) IsStarted() bool {
	return f.Start != nil
}

func (f *Fight) Zone(m messages.Zone) {
	if m.Zone.Equal(f.CurrentZone) {
		return
	}

	if !f.IsStarted() {
		f.StartFight(m)
	}

	f.EndFight(m)
}

func (f *Fight) Slain(slain messages.Slain) {
	if slain.Killer != nil {
		f.bump(*slain.Killer, slain.Date())
	}

	delete(f.FriendlyActive, slain.Victim)
	delete(f.EnemiesActive, slain.Victim)
	delete(f.UnknownActive, slain.Victim)
	f.Deaths[slain.Victim] = slain.Date()

	if f.IsStarted() && len(f.EnemiesActive) == 0 && len(f.FriendlyActive) != 0 {
		f.EndFight(slain)
	}
}

func (f *Fight) Heal(d messages.Heal) {
	f.bump(d.Target, d.Date())
	f.bump(d.Caster, d.Date())
}

func (f *Fight) Damage(d messages.Damage) {
	f.bump(d.Caster, d.Date())
	f.bump(d.Target, d.Date())

	f.StartFight(d)
}

func (f *Fight) bump(id guid.GUID, ts time.Time) {
	if _, ok := f.Deaths[id]; ok {
		// Don't allow this atm...
		f.Logger.Error("bumping a dead unit", slog.String("guid", id.String()))
		return
	}

	ui, ok := f.getUnit(id)
	if !ok {
		f.Logger.Debug("unknown unit in fight, marking as unknown", slog.String("guid", id.String()))
		f.UnknownActive[id] = ts
		return
	}

	// always update what units where in the fight
	f.Units[id] = ui

	if _, isUnknown := f.UnknownActive[id]; isUnknown {
		delete(f.UnknownActive, id)
	}

	if ui.CanCooperate {
		f.FriendlyActive[id] = ts
		return
	}

	f.EnemiesActive[id] = ts
}

func (f *Fight) getUnit(gid guid.GUID) (unitinfo.Info, bool) {
	return f.s.Units.Get(gid)
}

// String returns a summary of the fights
func (fs *Fights) String() string {
	var b strings.Builder

	completedFights := 0
	for _, fight := range fs.Fights {
		if fight.IsStarted() && fight.IsDone() {
			completedFights++
		}
	}

	b.WriteString(fmt.Sprintf("=== Fight Summary (%d total, %d completed) ===\n", len(fs.Fights), completedFights))

	for i, fight := range fs.Fights {
		if fight.IsStarted() && fight.IsDone() {
			b.WriteString(fmt.Sprintf("\n--- Fight #%d ---\n", i+1))
			b.WriteString(fight.String())
		}
	}

	return b.String()
}

// String returns a summary of a single fight
func (f *Fight) String() string {
	var b strings.Builder

	// Zone and duration
	if f.CurrentZone.Name != "" {
		b.WriteString(fmt.Sprintf("Zone: %s", f.CurrentZone.Name))
		if f.CurrentZone.InstanceID > 0 {
			b.WriteString(fmt.Sprintf(" (Instance %d)", f.CurrentZone.InstanceID))
		}
		b.WriteString("\n")
	}

	if f.IsStarted() && f.IsDone() {
		duration := f.End.Date().Sub(f.Start.Date())
		b.WriteString(fmt.Sprintf("Duration: %s\n", duration.Round(time.Second)))
		b.WriteString(fmt.Sprintf("Start: %s\n", f.Start.Date().Format("15:04:05")))
		b.WriteString(fmt.Sprintf("End: %s\n", f.End.Date().Format("15:04:05")))
	} else if f.IsStarted() {
		b.WriteString("Status: In Progress\n")
	} else {
		b.WriteString("Status: Not Started\n")
	}

	// Participants summary
	if len(f.Units) > 0 {
		b.WriteString(fmt.Sprintf("\nParticipants: %d\n", len(f.Units)))
		for guid, info := range f.Units {
			b.WriteString(fmt.Sprintf("  - %s (%s)\n", info.Name, guid))
		}
	}

	//// Damage summary
	//if len(f.DamageDone) > 0 {
	//	b.WriteString("\nDamage Done:\n")
	//	type damagePair struct {
	//		guid   guid.GUID
	//		amount int64
	//	}
	//	var pairs []damagePair
	//	for g, amt := range f.DamageDone {
	//		pairs = append(pairs, damagePair{guid: g, amount: amt})
	//	}
	//	sort.Slice(pairs, func(i, j int) bool {
	//		return pairs[i].amount > pairs[j].amount
	//	})
	//
	//	for _, pair := range pairs {
	//		name := f.getUnitName(pair.guid)
	//		b.WriteString(fmt.Sprintf("  - %-20s: %10d\n", name, pair.amount))
	//	}
	//}
	//
	//// Healing summary
	//if len(f.HealingDone) > 0 {
	//	b.WriteString("\nHealing Done:\n")
	//	type healingPair struct {
	//		guid   guid.GUID
	//		amount int64
	//	}
	//	var pairs []healingPair
	//	for g, amt := range f.HealingDone {
	//		pairs = append(pairs, healingPair{guid: g, amount: amt})
	//	}
	//	sort.Slice(pairs, func(i, j int) bool {
	//		return pairs[i].amount > pairs[j].amount
	//	})
	//
	//	for _, pair := range pairs {
	//		name := f.getUnitName(pair.guid)
	//		b.WriteString(fmt.Sprintf("  - %-20s: %10d\n", name, pair.amount))
	//	}
	//}

	// Units summary
	//totalUnits := len(f.Units.Units)
	//friendlyCount := len(f.Units.FriendlyActive)
	//enemyCount := len(f.Units.EnemiesActive)
	//deathCount := len(f.Units.Deaths)
	//
	//b.WriteString(fmt.Sprintf("\nUnits: %d total, %d friendly, %d enemies, %d deaths\n",
	//	totalUnits, friendlyCount, enemyCount, deathCount))

	return b.String()
}
