package vanillaparser

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
)

type State struct {
	logger *slog.Logger
	Me     types.Unit

	// Participants is a map of guids to combatants we've seen. It will always be
	// updated with the last seen combatant for that guid.
	//
	// If the combatant has changed (like gear or w/e), that info needs to be captured
	// in the time bound data.
	Participants map[guid.GUID]combatant.Combatant

	// CurrentZone is the zone the player is currently in.
	CurrentZone zone.Zone

	CurrentFight *Fight
	Fights       []*Fight
}

func NewState(logger *slog.Logger, me types.Unit) *State {
	return &State{
		logger:       logger,
		Participants: make(map[guid.GUID]combatant.Combatant),
		Me:           me,
		Fights:       make([]*Fight, 0),
	}
}

func (s *State) Process(m Message) error {
	switch typed := m.(type) {
	case Zone:
		s.Zone(typed)
	case Damage:
		s.Damage(typed)
	case Cast:
		s.CastV2(typed)
	case Combatant:
		s.Combatant(typed)
	case Slain:
		s.Slain(typed)
	}
	if s.CurrentFight != nil {
		s.CurrentFight.CheckDone(m.Date())
		if s.CurrentFight.IsDone() {
			s.CurrentFight = nil
		}
	}
	return nil
}

func (s *State) Zone(z Zone) {
	if z.Name == "" {
		// Ignore empty zones
		return
	}
	defer func() {
		// Always set the current zone at the end
		s.CurrentZone = z.Zone
	}()

	if s.CurrentFight != nil && !s.CurrentZone.Equal(z.Zone) {
		// Change in zone should end the current fight
		s.CurrentFight.FinishFight(z.Date())
	}

	if s.CurrentZone.Equal(z.Zone) {
		return
	}

	s.logger.Info(fmt.Sprintf("Zone changed to %q (instance %d)", z.Name, z.InstanceID),
		slog.String("zone_name", z.Name),
		slog.Uint64("instance_id", uint64(z.InstanceID)),
		slog.String("exited_from", s.CurrentZone.Name),
		slog.Uint64("exited_instance_id", uint64(s.CurrentZone.InstanceID)),
		slog.Time("seen", z.Seen),
	)
}

func (s *State) Damage(damage Damage) {
	if s.CurrentFight == nil {
		s.CurrentFight = NewFight(s.logger, damage.Date(), s.CurrentZone)
		s.Fights = append(s.Fights, s.CurrentFight)
	}

	// Track who is in the fight
	s.CurrentFight.SeenParticipants(damage.Date(), damage.Caster, damage.Target)
	// Add total damage done/taken
	s.CurrentFight.DamageDone[damage.Caster] += int64(damage.Amount)
	s.CurrentFight.DamageTaken[damage.Target] += int64(damage.Amount)
}

func (s *State) Slain(slain Slain) {
	if s.CurrentFight == nil {
		// No fight ongoing, ignore
		return
	}
	s.CurrentFight.Slain(slain.Date(), slain.Victim)
}

func (s *State) CastV2(cst Cast) {

}

func (s *State) Combatant(cmbt Combatant) {
	if cmbt.Guid.IsZero() {
		return
	}

	if _, ok := s.Participants[cmbt.Guid]; !ok {
		// New combatant!
		s.logger.Debug("new combatant",
			slog.String("name", cmbt.Name),
			slog.String("guid", cmbt.Guid.String()),
			slog.String("class", cmbt.HeroClass.String()),
			slog.String("race", cmbt.Race.String()),
		)
	}

	s.Participants[cmbt.Guid] = cmbt.Combatant
}

func (s *State) String() string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("State with %d participants:\n", len(s.Participants)))
	str.WriteString(fmt.Sprintf("Had %d fights\n", len(s.Fights)))
	for gid, cmbt := range s.Participants {
		str.WriteString(fmt.Sprintf(" - %s: %s the %s\n",
			gid.String(), cmbt.Name, cmbt.HeroClass.String(),
		))
	}

	return str.String()
}

func ensure[K comparable, V any](m map[K][]V, key K) bool {
	if m[key] == nil {
		m[key] = []V{}
		return true
	}
	return false
}
