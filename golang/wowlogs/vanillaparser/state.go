package vanillaparser

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/castv2"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
)

type State struct {
	logger            *slog.Logger
	Participants      map[guid.GUID][]combatant.Combatant
	ParticipantDamage map[guid.GUID]int64
	ParticipantCasts  map[guid.GUID]map[int]types.Spell

	// LastCast is the last spell cast by each participant, keyed by GUID and spell name.
	// This allows us to map the spell id to the spell name for easier lookup.
	LastCast map[guid.GUID]map[string]types.Spell
}

func NewState(logger *slog.Logger) *State {
	return &State{
		logger:            logger,
		Participants:      make(map[guid.GUID][]combatant.Combatant),
		ParticipantCasts:  make(map[guid.GUID]map[int]types.Spell),
		ParticipantDamage: make(map[guid.GUID]int64),
	}
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

	s.castedSpell(cst)

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
	s.logger.Debug("new spell cast",
		slog.String("caster_name", cst.Caster.Name),
		slog.String("caster_guid", cst.Caster.Gid.String()),
		slog.String("spell_name", cst.Spell.Name),
		slog.Int("spell_id", int(cst.Spell.ID)),
	)
}

func (s *State) castedSpell(cst castv2.CastV2) {
	if !cst.Caster.HasGuid() || cst.Spell.Name == "" {
		return
	}
	caster := cst.Caster.Gid
	if s.LastCast[caster] == nil {
		s.LastCast[caster] = make(map[string]types.Spell)
	}
	s.LastCast[caster][cst.Spell.Name] = cst.Spell
}

func (s *State) LastCastedSpell(caster guid.GUID, spellName string) types.Spell {
	if s.LastCast[caster] == nil {
		return types.Spell{
			Name: spellName,
		}
	}
	spell, ok := s.LastCast[caster][spellName]
	if !ok {
		spell = types.Spell{
			Name: spellName,
		}
	}
	return spell
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
		s.logger.Debug("new combatant",
			slog.String("name", cmbt.Name),
			slog.String("guid", cmbt.Guid.String()),
			slog.String("class", cmbt.HeroClass.String()),
			slog.String("race", cmbt.Race.String()),
		)
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
