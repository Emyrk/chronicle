package vanillaparser

import (
	"fmt"
	"log/slog"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/castv2"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
)

type State struct {
	logger            *slog.Logger
	Participants      map[guid.GUID][]combatant.Combatant
	ParticipantDamage map[guid.GUID]int64
	ParticipantCasts  map[guid.GUID]map[int]types.Spell
	Me                types.Unit

	CurrentZone zone.Zone
	Zones       []zone.Zone
}

func NewState(logger *slog.Logger, me types.Unit) *State {
	return &State{
		logger:            logger,
		Participants:      make(map[guid.GUID][]combatant.Combatant),
		ParticipantCasts:  make(map[guid.GUID]map[int]types.Spell),
		ParticipantDamage: make(map[guid.GUID]int64),
		Me:                me,
	}
}

func (s *State) Zone(z zone.Zone) {
	if z.Name == "" {
		// Ignore empty zones
		return
	}
	defer func() {
		// Always set the current zone at the end
		s.CurrentZone = z
	}()

	if s.CurrentZone.Equal(z) {
		return
	}

	if !slices.ContainsFunc(s.Zones, func(zz zone.Zone) bool {
		return zz.Equal(z)
	}) {
		s.Zones = append(s.Zones, z)
	}

	s.logger.Info(fmt.Sprintf("Zone changed to %q (instance %d)", z.Name, z.InstanceID),
		slog.String("zone_name", z.Name),
		slog.Uint64("instance_id", uint64(z.InstanceID)),
		slog.String("exited_from", s.CurrentZone.Name),
		slog.Uint64("exited_instance_id", uint64(s.CurrentZone.InstanceID)),
		slog.Time("seen", z.Seen),
	)
}

func (s *State) SpellDamage(damage SpellDamage) {
	if !damage.Caster.IsPlayer() {
		// Only track players for now
		return
	}

	s.ParticipantDamage[damage.Caster] += int64(damage.Amount)
}

func (s *State) CastV2(cst castv2.CastV2) {
	if !cst.Caster.HasGuid() {
		return
	}

	if !cst.Caster.Gid.IsPlayer() {
		// Only track players for now
		return
	}

	if s.ParticipantCasts[cst.Caster.Gid] == nil {
		s.ParticipantCasts[cst.Caster.Gid] = make(map[int]types.Spell)
	}

	if _, ok := s.ParticipantCasts[cst.Caster.Gid][cst.Spell.ID]; ok {
		return
	}

	s.ParticipantCasts[cst.Caster.Gid][cst.Spell.ID] = cst.Spell
	//s.logger.Debug("new spell cast",
	//	slog.String("caster_name", cst.Caster.Name),
	//	slog.String("caster_guid", cst.Caster.Gid.String()),
	//	slog.String("spell_name", cst.Spell.Name),
	//	slog.Int("spell_id", int(cst.Spell.ID)),
	//)
}

func (s *State) Combatant(cmbt combatant.Combatant) {
	if cmbt.Guid.IsZero() {
		return
	}

	if !cmbt.Guid.IsPlayer() {
		// Only track players for now
		return
	}

	if s.ParticipantCasts[cmbt.Guid] == nil {
		s.ParticipantCasts[cmbt.Guid] = make(map[int]types.Spell)
	}
	newPlayer := insert(s.Participants, cmbt.Guid, cmbt)

	if newPlayer {
		//s.logger.Debug("new combatant",
		//	slog.String("name", cmbt.Name),
		//	slog.String("guid", cmbt.Guid.String()),
		//	slog.String("class", cmbt.HeroClass.String()),
		//	slog.String("race", cmbt.Race.String()),
		//)
	}
}

func (s *State) String() string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("State with %d participants:\n", len(s.Participants)))
	for gid, cmbts := range s.Participants {
		cmbt := cmbts[0]
		str.WriteString(fmt.Sprintf(" - %s: %s the %s had %d unique spells and did %d damage\n",
			gid.String(), cmbt.Name, cmbt.HeroClass.String(),
			len(s.ParticipantCasts[gid]),
			s.ParticipantDamage[gid],
		))
	}

	return str.String()
}

func insert[K comparable, V any](m map[K][]V, key K, value V) bool {
	b := ensure(m, key)
	m[key] = append(m[key], value)
	return b
}

func ensure[K comparable, V any](m map[K][]V, key K) bool {
	if m[key] == nil {
		m[key] = []V{}
		return true
	}
	return false
}
