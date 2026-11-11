package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	ladyDeathwhisperEntry       uint32 = 36855
	orgrimsHammerEntry          uint32 = 37215
	theSkybreakerEntry          uint32 = 37540
	professorPutricideEntry     uint32 = 36678
	valithriaDreamwalkerEntry   uint32 = 36789
	sindragosaEntry             uint32 = 36853
	theLichKingEntry            uint32 = 36597
	dreamwalkersRageSpellID            = chrondbc.SpellID(71189)
	manaBarrierSpellID                 = chrondbc.SpellID(70842)
	lichKingEpilogueTimeout            = 2 * time.Minute
	iccRecentlySlainSuppression        = 45 * time.Second
)

var (
	gunshipEncounterEntries = []uint32{
		orgrimsHammerEntry, theSkybreakerEntry,
		36838, 36839, 36939, 36948, 36950, 36957, 36960, 36961,
		36968, 36969, 36978, 36982, 36998, 37003, 37004, 37016, 37017,
		37021, 37026, 37027, 37028, 37030, 37031, 37032, 37033, 37035,
		37116, 37117, 37144, 37148, 37920,
	}
	valithriaAdds = []uint32{36791, 37863, 37868, 37886, 37907, 37934, 37985, 38068, 38421}
)

const (
	LadyDeathwhisperPhaseKeyP1 = "lady_deathwhisper_p1"
	LadyDeathwhisperPhaseKeyP2 = "lady_deathwhisper_p2"

	ProfessorPutricidePhaseKeyP1 = "professor_putricide_p1"
	ProfessorPutricidePhaseKeyP3 = "professor_putricide_p3"

	SindragosaPhaseKeyP1 = "sindragosa_p1"
	SindragosaPhaseKeyP3 = "sindragosa_p3"

	LichKingPhaseKeyP1          = "lich_king_p1"
	LichKingPhaseKeyTransition1 = "lich_king_transition_1"
	LichKingPhaseKeyP2          = "lich_king_p2"
	LichKingPhaseKeyTransition2 = "lich_king_transition_2"
	LichKingPhaseKeyP3          = "lich_king_p3"
	LichKingPhaseKeyEpilogue    = "lich_king_epilogue"
)

var LadyDeathwhisperPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Lady Deathwhisper",
	Definitions: []phases.Definition{
		{Key: LadyDeathwhisperPhaseKeyP1, Name: "Mana Barrier", Order: 0},
		{Key: LadyDeathwhisperPhaseKeyP2, Name: "Frostbolt", Order: 1},
	},
}

var ProfessorPutricidePhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Professor Putricide",
	Definitions: []phases.Definition{
		{Key: ProfessorPutricidePhaseKeyP1, Name: "Experiments", Order: 0},
		{Key: ProfessorPutricidePhaseKeyP3, Name: "Mutated Plague", Order: 1},
	},
}

var SindragosaPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Sindragosa",
	Definitions: []phases.Definition{
		{Key: SindragosaPhaseKeyP1, Name: "Ground and Air", Order: 0},
		{Key: SindragosaPhaseKeyP3, Name: "Mystic Buffet", Order: 1},
	},
}

var LichKingPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "The Lich King",
	Definitions: []phases.Definition{
		{Key: LichKingPhaseKeyP1, Name: "Phase 1", Order: 0},
		{Key: LichKingPhaseKeyTransition1, Name: "Transition 1", Order: 1},
		{Key: LichKingPhaseKeyP2, Name: "Phase 2", Order: 2},
		{Key: LichKingPhaseKeyTransition2, Name: "Transition 2", Order: 3},
		{Key: LichKingPhaseKeyP3, Name: "Phase 3", Order: 4},
		{Key: LichKingPhaseKeyEpilogue, Name: "Epilogue", Order: 5},
	},
}

type gunshipBattleCharacter struct {
	*characters.Common
	all *characters.Characters
}

// NewGunshipBattleCharacter treats either faction's enemy gunship positive-overkill
// hit as the scripted victory and ends the linked crew activity with the ship.
func NewGunshipBattleCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if entry != orgrimsHammerEntry && entry != theSkybreakerEntry {
		return nil, false
	}

	common := characters.NewCommonCharacter(id, all).WithTimeout(6 * time.Minute)
	common.SetRecentlySlainDuration(iccRecentlySlainSuppression)
	return &gunshipBattleCharacter{Common: common, all: all}, true
}

func (c *gunshipBattleCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}

	damage, ok := m.(*messages.Damage)
	if !ok || damage.Target != c.ID() || damage.Overkill <= 0 {
		return nil
	}
	c.Died("gunship_positive_overkill", m)
	markLinkedEntriesSlain(c.all, gunshipEncounterEntries, "gunship_scripted_victory", m)
	return nil
}

type valithriaDreamwalkerCharacter struct {
	*characters.Common
	all *characters.Characters
}

// NewValithriaDreamwalker marks Dreamwalker's Rage as the scripted encounter
// victory. Valithria survives the encounter, so no death event is logged.
func NewValithriaDreamwalker(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != valithriaDreamwalkerEntry {
		return nil, false
	}

	common := characters.NewCommonCharacter(id, all)
	common.SetRecentlySlainDuration(iccRecentlySlainSuppression)
	return &valithriaDreamwalkerCharacter{Common: common, all: all}, true
}

func (c *valithriaDreamwalkerCharacter) Process(m messages.Message) error {
	if cast, ok := m.(*messages.SpellStart); ok && cast.Caster == c.ID() && cast.SpellID == dreamwalkersRageSpellID {
		// The victory damage lands about three seconds after this cast. Preserve
		// the active encounter until that authoritative positive-overkill signal.
		c.Bump("valithria_dreamwalkers_rage_cast", m)
		return nil
	}

	damage, ok := m.(*messages.Damage)
	if ok && damage.Caster != nil && *damage.Caster == c.ID() && damage.SpellID == dreamwalkersRageSpellID && damage.Overkill > 0 {
		c.Died("valithria_dreamwalkers_rage", m)
		markLinkedEntriesSlain(c.all, valithriaAdds, "valithria_scripted_victory", m)
		return nil
	}

	return c.Common.Process(m)
}

func markLinkedEntriesSlain(all *characters.Characters, entries []uint32, reason string, m messages.Message) {
	linkedEntries := make(map[uint32]struct{}, len(entries))
	for _, entry := range entries {
		linkedEntries[entry] = struct{}{}
	}
	_ = all.All.ForEach(func(linked characters.Character) error {
		entry, ok := linked.ID().GetEntry()
		if !ok {
			return nil
		}
		if _, linkedToEncounter := linkedEntries[entry]; !linkedToEncounter || linked.LastEndState() == period.EndStateSlain {
			return nil
		}
		if !linked.IsActive() {
			if starter, ok := linked.(interface {
				Start(string, messages.Message)
			}); ok {
				starter.Start(reason, m)
			}
		}
		linked.Died(reason, m)
		return nil
	})
}

type ladyDeathwhisperCharacter struct {
	*characters.Common
	all      *characters.Characters
	phaseTwo bool
}

func NewLadyDeathwhisper(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != ladyDeathwhisperEntry {
		return nil, false
	}
	return &ladyDeathwhisperCharacter{Common: characters.NewCommonCharacter(id, all), all: all}, true
}

func (c *ladyDeathwhisperCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return LadyDeathwhisperPhaseDefinitions
}

func (c *ladyDeathwhisperCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if err := c.Common.Process(m); err != nil {
		return err
	}
	if !wasActive && c.IsActive() {
		c.phaseTwo = false
	}
	if !c.IsActive() || c.phaseTwo {
		return nil
	}
	aura, ok := m.(*messages.Aura)
	if ok && aura.Target == c.ID() && aura.SpellID == manaBarrierSpellID && aura.State == types.AuraStateRemoved {
		c.all.EmitPhaseTransition(phases.Transition{SourceGUID: c.ID(), ToPhaseKey: LadyDeathwhisperPhaseKeyP2, Timestamp: m.Date()})
		c.phaseTwo = true
	}
	return nil
}

type professorPutricideCharacter struct {
	*characters.Common
	all   *characters.Characters
	phase int
}

func NewProfessorPutricide(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != professorPutricideEntry {
		return nil, false
	}
	return &professorPutricideCharacter{Common: characters.NewCommonCharacter(id, all), all: all}, true
}

func (c *professorPutricideCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return ProfessorPutricidePhaseDefinitions
}

func (c *professorPutricideCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if err := c.Common.Process(m); err != nil {
		return err
	}
	if !wasActive && c.IsActive() {
		c.phase = 1
	}
	if !c.IsActive() {
		c.phase = 0
		return nil
	}
	cast, ok := m.(*messages.SpellStart)
	if !ok || cast.Caster != c.ID() {
		return nil
	}
	if c.phase == 1 && isSpellID(cast.SpellID, 71893, 73121, 73122, 73123) {
		c.transition(3, ProfessorPutricidePhaseKeyP3, m)
	}
	return nil
}

func (c *professorPutricideCharacter) transition(phase int, key string, m messages.Message) {
	c.all.EmitPhaseTransition(phases.Transition{SourceGUID: c.ID(), ToPhaseKey: key, Timestamp: m.Date()})
	c.phase = phase
}

type sindragosaCharacter struct {
	*characters.Common
	all        *characters.Characters
	finalPhase bool
}

func NewSindragosa(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != sindragosaEntry {
		return nil, false
	}
	return &sindragosaCharacter{Common: characters.NewCommonCharacter(id, all), all: all}, true
}

func (c *sindragosaCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return SindragosaPhaseDefinitions
}

func (c *sindragosaCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if err := c.Common.Process(m); err != nil {
		return err
	}
	if !wasActive && c.IsActive() {
		c.finalPhase = false
	}
	if !c.IsActive() || c.finalPhase {
		return nil
	}
	aura, ok := m.(*messages.Aura)
	if ok && aura.Source != nil && *aura.Source == c.ID() && aura.Transition == messages.AuraTransitionApplied && isSpellID(aura.SpellID, 72528, 72529, 72530) {
		c.all.EmitPhaseTransition(phases.Transition{SourceGUID: c.ID(), ToPhaseKey: SindragosaPhaseKeyP3, Timestamp: m.Date()})
		c.finalPhase = true
	}
	return nil
}

type lichKingCharacter struct {
	*characters.Common
	all   *characters.Characters
	phase int
}

func NewLichKing(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != theLichKingEntry {
		return nil, false
	}
	return &lichKingCharacter{Common: characters.NewCommonCharacter(id, all), all: all}, true
}

func (c *lichKingCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return LichKingPhaseDefinitions
}

func (c *lichKingCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if err := c.Common.Process(m); err != nil {
		return err
	}
	if !wasActive && c.IsActive() {
		c.phase = 1
	}
	if !c.IsActive() {
		c.phase = 0
		return nil
	}
	if cast, ok := m.(*messages.SpellGo); ok && cast.Caster == c.ID() && c.phase == 6 && cast.SpellID == 71769 {
		c.Bump("lich king raise dead", m)
		return nil
	}

	cast, ok := m.(*messages.SpellStart)
	if !ok || cast.Caster != c.ID() {
		return nil
	}
	switch {
	case c.phase == 1 && isSpellID(cast.SpellID, 68981, 74270, 74271):
		c.transition(2, LichKingPhaseKeyTransition1, m)
	case c.phase == 2 && cast.SpellID == 72262:
		c.transition(3, LichKingPhaseKeyP2, m)
	case c.phase == 3 && isSpellID(cast.SpellID, 72259, 74273):
		c.transition(4, LichKingPhaseKeyTransition2, m)
	case c.phase == 4 && cast.SpellID == 72262:
		c.transition(5, LichKingPhaseKeyP3, m)
	case c.phase == 5 && cast.SpellID == 72350:
		if current, ok := c.Activity.Current(); ok {
			current.Meta.BumpBy = lichKingEpilogueTimeout
			current.Bump("lich king scripted epilogue", m)
		}
		c.transition(6, LichKingPhaseKeyEpilogue, m)
	}
	return nil
}

func (c *lichKingCharacter) transition(phase int, key string, m messages.Message) {
	c.all.EmitPhaseTransition(phases.Transition{SourceGUID: c.ID(), ToPhaseKey: key, Timestamp: m.Date()})
	c.phase = phase
}

func isSpellID(got chrondbc.SpellID, ids ...chrondbc.SpellID) bool {
	for _, id := range ids {
		if got == id {
			return true
		}
	}
	return false
}
