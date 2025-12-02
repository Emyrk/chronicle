package state

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
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
		last := fs.CurrentFight
		fs.CurrentFight = NewFight(fs.s)
		fs.CurrentFight.PreviousFight = last
		fs.Fights = append(fs.Fights, fs.CurrentFight)
	}

	return nil
}

type Fight struct {
	Logger        *slog.Logger
	s             *State // Reference to parent state
	PreviousFight *Fight

	// Lives keeps track of the life spans of units during the fight.
	// A unit can be revived during a fight, so multiple lives are possible.
	// TODO: portals too maybe? Like hearth
	Lives map[guid.GUID]Lives

	CurrentZone zone.Zone

	// Start & End of the fight
	Start messages.Message
	End   messages.Message
}

func NewFight(s *State) *Fight {
	return &Fight{
		Logger:      s.logger,
		s:           s,
		Lives:       make(map[guid.GUID]Lives),
		CurrentZone: s.CurrentZone,
	}
}

func (f *Fight) Process(m messages.Message) error {
	if f.IsDone() {
		return errors.New("fight is already done")
	}

	var err error
	switch typed := m.(type) {
	case messages.Zone:
		f.Zone(typed)
	case messages.Damage:
		f.Damage(typed)
	case messages.FallDamage:
		//f.FallDamage(typed)
	case messages.Cast:
		err = f.CastV2(typed)
	case messages.Heal:
		f.Heal(typed)
	case messages.Combatant:
		//f.Combatant(typed)
	case messages.Unit:
		//f.Unit(typed)
	case messages.Slain:
		err = f.Slain(typed)
	}
	if err != nil {
		return err
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

func (f *Fight) Slain(slain messages.Slain) error {
	if slain.Killer != nil {
		f.BumpUnit(*slain.Killer, slain)
	}

	_, err := f.UnitLives(slain.Victim, slain)
	if err != nil {
		return fmt.Errorf("slain: %w", err)
	}

	if f.IsStarted() {
		remaining := f.RemainingUnits()
		f.Logger.Info("slain unit",
			slog.Int("friendly_active", remaining.FriendlyActive),
			slog.Int("hostile_active", remaining.HostileActive),
			slog.Int("friendly_inactive", remaining.FriendlyInactive),
			slog.Int("hostile_inactive", remaining.HostileInactive),
			slog.Int("unknown_active", remaining.UnknownActive),
			slog.Int("unknown_inactive", remaining.UnknownInactive),
		)
		if remaining.HostileActive == 0 && remaining.FriendlyActive != 0 {
			f.EndFight(slain)
		}
	}

	return nil
}

func (f *Fight) Heal(d messages.Heal) {

}

func (f *Fight) CastV2(c messages.Cast) error {
	if c.Action != types.CastActionsFailsCasting {
		// Caster is alive if they start casting something
		_, err := f.UnitLives(c.Caster.Gid, c)
		if err != nil {
			return fmt.Errorf("castv2: %w", err)
		}
	}

	f.BumpUnit(c.Caster.Gid, c)
	if c.Target != nil {
		f.BumpUnit(c.Target.Gid, c)
	}
	return nil
}

func (f *Fight) Damage(d messages.Damage) error {
	f.BumpUnit(d.Caster, d)
	f.BumpUnit(d.Target, d)

	if d.HitType.Has(types.HitTypeHit) || d.HitType.Has(types.HitTypeCrit) {
		_, err := f.UnitLives(d.Caster, d)
		if err != nil {
			return fmt.Errorf("damage: %w", err)
		}
	}

	if !d.HitType.Has(types.HitTypePeriodic) {
		// Start fight on direct damage, not DoTs
		if f.PreviousFight == nil {
			f.StartFight(d)
		} else {
			recentlyInactive := func(id guid.GUID) bool {
				exists, ok := f.PreviousFight.Lives[d.Caster]
				if !ok {
					return false
				}

				if exists.IsActive() {
					return false
				}

				lastActivity := exists.LastInactiveMessage()
				if lastActivity == nil {
					return false
				}
				if d.Date().Sub(lastActivity.Date()) < time.Second {
					return true
				}
				return false
			}

			if !recentlyInactive(d.Target) || !recentlyInactive(d.Caster) {
				f.StartFight(d)
			}
		}
	}
	return nil
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

func (f *Fight) BumpUnit(id guid.GUID, msg messages.Message) Lives {
	if life, ok := f.Lives[id]; ok {
		life.Bump(msg)
		return life
	}

	life := NewLives(msg)
	f.Lives[id] = life
	return life
}

func (f *Fight) UnitLives(id guid.GUID, msg messages.Message) (Lives, error) {
	lives := f.BumpUnit(id, msg)
	if !lives.IsActive() {
		err := lives.StartLife(msg)
		if err != nil {
			return lives, fmt.Errorf("start life: %w", err)
		}
	}

	return lives, nil
}

type RemainingUnits struct {
	FriendlyActive int
	HostileActive  int
	UnknownActive  int

	FriendlyInactive int
	HostileInactive  int
	UnknownInactive  int
}

func (f *Fight) RemainingUnits() RemainingUnits {
	summary := RemainingUnits{}

	for gid, lives := range f.Lives {

		info, haveInfo := f.s.Units.Get(gid)
		if !haveInfo {
			f.Logger.Warn("unknown unit", slog.String("gid", gid.String()))
			if lives.IsActive() {
				summary.UnknownActive++
			} else {
				summary.UnknownInactive++
			}
			continue
		}

		if info.CanCooperate {
			if lives.IsActive() {
				summary.FriendlyActive++
			} else {
				summary.FriendlyInactive++
			}
			continue
		}

		if lives.IsActive() {
			summary.HostileActive++
		} else {
			summary.HostileInactive++
		}
	}
	return summary
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
	if len(f.Lives) > 0 {
		b.WriteString(fmt.Sprintf("\nParticipants: %d\n", len(f.Lives)))
		for guid, _ := range f.Lives {
			info, ok := f.s.Units.Get(guid)
			if !ok {
				b.WriteString(fmt.Sprintf("  - Unknown (%s)\n", guid))
				continue
			}
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
