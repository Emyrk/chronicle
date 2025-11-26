package state

import (
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
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
	s      *State // reference to parent state for accessing Me

	Participants *Combatants
	Units        *Units

	DamageDone   map[guid.GUID]int64
	DamageTaken  map[guid.GUID]int64
	HealingDone  map[guid.GUID]int64
	HealingTaken map[guid.GUID]int64

	CurrentZone zone.Zone

	Start messages.Message
	End   messages.Message
}

func NewFight(logger *slog.Logger, s *State) *Fight {
	return &Fight{
		Logger:       logger,
		s:            s,
		Participants: NewCombatants(s.Participants),
		Units:        NewUnits(s.Units),
		DamageDone:   make(map[guid.GUID]int64),
		DamageTaken:  make(map[guid.GUID]int64),
		HealingDone:  make(map[guid.GUID]int64),
		HealingTaken: make(map[guid.GUID]int64),
		CurrentZone:  s.CurrentZone,
	}
}

func (f *Fight) Process(m messages.Message) error {
	switch typed := m.(type) {
	case messages.Zone:
		f.Zone(typed)
	case messages.Damage:
		f.Damage(typed)
	case messages.FallDamage:
		f.FallDamage(typed)
	case messages.Cast:
	//s.CastV2(typed)
	case messages.Heal:
		f.Heal(typed)
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
	f.Units.Seen(d.Date(), d.Caster, d.Target)

	f.DamageDone[d.Caster] += int64(d.Amount)
	f.DamageTaken[d.Target] += int64(d.Amount)
	f.StartFight(d)
}

func (f *Fight) FallDamage(d messages.FallDamage) {
	f.Units.Seen(d.Date(), d.Target)

	f.DamageTaken[d.Target] += int64(d.Amount)
}

func (f *Fight) Heal(d messages.Heal) {
	f.Units.Seen(d.Date(), d.Caster, d.Target)

	f.HealingDone[d.Caster] += int64(d.Amount)
	f.HealingTaken[d.Target] += int64(d.Amount)
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

func (f *Fight) cleanup() {

}

// getUnitName returns the name of a unit by its GUID, checking multiple sources
func (f *Fight) getUnitName(g guid.GUID) string {
	// Check if it's the player
	if f.s != nil && f.s.Me.Gid == g {
		return f.s.Me.Name
	}
	
	// Check units
	if info, ok := f.Units.Info(g); ok {
		return info.Name
	}
	
	// Check combatants
	if combatant, ok := f.Participants.Participants[g]; ok {
		return combatant.Name
	}
	
	// Fall back to GUID string
	return g.String()
}

// String returns a summary of the fights
func (fs *Fights) String() string {
	var b strings.Builder
	
	completedFights := 0
	for _, fight := range fs.Fights {
		if fight.Started() && fight.IsDone() {
			completedFights++
		}
	}
	
	b.WriteString(fmt.Sprintf("=== Fight Summary (%d total, %d completed) ===\n", len(fs.Fights), completedFights))
	
	for i, fight := range fs.Fights {
		if fight.Started() && fight.IsDone() {
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
	
	if f.Started() && f.IsDone() {
		duration := f.End.Date().Sub(f.Start.Date())
		b.WriteString(fmt.Sprintf("Duration: %s\n", duration.Round(time.Second)))
		b.WriteString(fmt.Sprintf("Start: %s\n", f.Start.Date().Format("15:04:05")))
		b.WriteString(fmt.Sprintf("End: %s\n", f.End.Date().Format("15:04:05")))
	} else if f.Started() {
		b.WriteString("Status: In Progress\n")
	} else {
		b.WriteString("Status: Not Started\n")
	}
	
	// Participants summary
	if len(f.Participants.Participants) > 0 {
		b.WriteString(fmt.Sprintf("\nParticipants: %d\n", len(f.Participants.Participants)))
		for guid, combatant := range f.Participants.Participants {
			b.WriteString(fmt.Sprintf("  - %s (%s)\n", combatant.Name, guid))
		}
	}
	
	// Damage summary
	if len(f.DamageDone) > 0 {
		b.WriteString("\nDamage Done:\n")
		type damagePair struct {
			guid   guid.GUID
			amount int64
		}
		var pairs []damagePair
		for g, amt := range f.DamageDone {
			pairs = append(pairs, damagePair{guid: g, amount: amt})
		}
		sort.Slice(pairs, func(i, j int) bool {
			return pairs[i].amount > pairs[j].amount
		})
		
		for _, pair := range pairs {
			name := f.getUnitName(pair.guid)
			b.WriteString(fmt.Sprintf("  - %-20s: %10d\n", name, pair.amount))
		}
	}
	
	// Healing summary
	if len(f.HealingDone) > 0 {
		b.WriteString("\nHealing Done:\n")
		type healingPair struct {
			guid   guid.GUID
			amount int64
		}
		var pairs []healingPair
		for g, amt := range f.HealingDone {
			pairs = append(pairs, healingPair{guid: g, amount: amt})
		}
		sort.Slice(pairs, func(i, j int) bool {
			return pairs[i].amount > pairs[j].amount
		})
		
		for _, pair := range pairs {
			name := f.getUnitName(pair.guid)
			b.WriteString(fmt.Sprintf("  - %-20s: %10d\n", name, pair.amount))
		}
	}
	
	// Units summary
	totalUnits := len(f.Units.Units)
	friendlyCount := len(f.Units.FriendlyActive)
	enemyCount := len(f.Units.EnemiesActive)
	deathCount := len(f.Units.Deaths)
	
	b.WriteString(fmt.Sprintf("\nUnits: %d total, %d friendly, %d enemies, %d deaths\n",
		totalUnits, friendlyCount, enemyCount, deathCount))
	
	return b.String()
}
