package creatures

import (
	"sync"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewGluth(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(
		15932, // Gluth
		16360, // Zombie Chow
	)(id, all)
}

func NewMaexxna(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(
		15952, // Maexxna
		17055, // Maexxna Spiderling
	)(id, all)
}

func NewNothThePlaguebringer(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(
		15954, // Noth
		16984, // Plagued Warrior
	)(id, all)
}

// NewGrobbulus -- Explodes on death
func NewGrobbulus(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}
	if entry, ok := id.GetEntry(); !ok || entry != 15931 {
		return nil, false
	}

	c := characters.NewPermanentDeath(characters.NewCommonCharacter(id, all))
	return characters.NewAdsGoWithBossCustomCharacter(c, all, 15931, 16290), true
}

func NewAnubRekhan(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(15956, 16573, 16698)(id, all)
}

func NewHeiganTheUnclean(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(15936,
		16236, // Eye Stalk
		16056, // Diseased Maggot
	)(id, all)
}

func NewEyeStalk(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != 16236 {
		return nil, false
	}
	return characters.NewCommonCharacter(id, all).WithTimeoutAsDeath(), true
}

func NewDiseasedMaggot(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != 16056 {
		return nil, false
	}
	return characters.NewCommonCharacter(id, all).WithTimeoutAsDeath(), true
}

const (
	thaddiusEntry = 15928
	stalaggEntry  = 15929
	feugenEntry   = 15930

	thaddiusTransitionWindow = 20 * time.Second

	gothikEntry              = 16060
	unrelentingTraineeEntry  = 16124
	unrelentingDeathknight   = 16125
	unrelentingRiderEntry    = 16126
	spectralTraineeEntry     = 16127
	spectralDeathknightEntry = 16148
	spectralHorseEntry       = 16149
	spectralRiderEntry       = 16150

	kelThuzadEntry              = 15990
	soldierOfTheFrozenWaste     = 16427
	soulWeaver                  = 16429
	unstoppableAbominationEntry = 16428
	guardianOfIcecrownEntry     = 16441
)

type ThaddiusParty struct {
	*characters.Common
	all *characters.Characters

	entry        uint32
	pendingDeath *messages.Message

	buggedPrevious guid.GUID
	killBugged     sync.Once
}

func NewThaddiusParty(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	var buggedPrevious guid.GUID
	switch entry {
	case thaddiusEntry:
	case stalaggEntry, feugenEntry:
		for _, o := range all.ByEntry[entry] {
			if o.IsActive() {
				buggedPrevious = o.ID()
				break
			}
		}
	default:
		return nil, false
	}

	return &ThaddiusParty{
		Common:         characters.NewCommonCharacter(id, all),
		all:            all,
		entry:          entry,
		buggedPrevious: buggedPrevious,
	}, true
}

func (c *ThaddiusParty) Process(m messages.Message) error {
	if !c.buggedPrevious.IsZero() {
		c.killBugged.Do(func() {
			prev, ok := c.all.Get(c.buggedPrevious)
			if ok {
				prev.Died("bugged_previous", m)
			}
			c.buggedPrevious = 0
		})
	}

	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	c.maybeFinalizePendingDeath(m)
	err := characters.ProcessCommonActivity(c, m)
	if err != nil {
		return err
	}

	return nil
}

func (c *ThaddiusParty) Died(reason string, m messages.Message) {
	if c.isAdd() {
		c.pendingDeath = &m
		c.LastSlain = m
		return
	}
	c.Common.Died(reason, m)
}

func (c *ThaddiusParty) isAdd() bool {
	return c.entry == stalaggEntry || c.entry == feugenEntry
}

func (c *ThaddiusParty) thaddiusActive() bool {
	for _, boss := range c.all.ByEntry[thaddiusEntry] {
		if boss.IsActive() {
			return true
		}
	}
	return false
}

func (c *ThaddiusParty) maybeFinalizePendingDeath(m messages.Message) {
	if c.pendingDeath == nil {
		return
	}

	if c.thaddiusActive() {
		c.finalizePendingDeath("thaddius_phase_transition", m)
		return
	}

	deathTime := (*c.pendingDeath).Date()
	if m.Date().Sub(deathTime) >= thaddiusTransitionWindow {
		c.finalizePendingDeath("thaddius_transition_timeout", m)
	}
}

func (c *ThaddiusParty) finalizePendingDeath(reason string, m messages.Message) {
	c.Common.Died(reason, m)
	c.pendingDeath = nil
}

func NewGothikRoom(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if !isGothikEntry(entry) {
		return nil, false
	}
	return characters.NewRoomMechanic(id, gothikEntry, all)
}

func isGothikEntry(entry uint32) bool {
	switch entry {
	case gothikEntry,
		unrelentingTraineeEntry,
		unrelentingDeathknight,
		unrelentingRiderEntry,
		spectralTraineeEntry,
		spectralDeathknightEntry,
		spectralHorseEntry,
		spectralRiderEntry:
		return true
	default:
		return false
	}
}

// Phase key constants for Kel'Thuzad.
const (
	KelThuzadPhaseKeyP1 = "kel_thuzad_p1"
	KelThuzadPhaseKeyP2 = "kel_thuzad_p2"
)

// KelThuzadPhaseDefinitions contains the encounter phase definitions for Kel'Thuzad.
var KelThuzadPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Kel'Thuzad",
	Definitions: []phases.Definition{
		{Key: KelThuzadPhaseKeyP1, Name: "Adds", Order: 0},
		{Key: KelThuzadPhaseKeyP2, Name: "Boss", Order: 1},
	},
}

type kelThuzad struct {
	*characters.PermanentDeath
	room *characters.RoomMechanic
	all  *characters.Characters

	p2Emitted bool
}

func (c *kelThuzad) PhaseDefinitions() *phases.EncounterPhases {
	return KelThuzadPhaseDefinitions
}

func (c *kelThuzad) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if current, ok := c.room.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}
	if wasActive && !c.IsActive() {
		c.p2Emitted = false
	}

	if damage, ok := m.(*messages.Damage); ok &&
		damage.Target == c.ID() &&
		damage.Amount > 0 &&
		!c.p2Emitted {
		c.p2Emitted = true
		c.all.EmitPhaseTransition(phases.Transition{
			SourceGUID: c.ID(),
			ToPhaseKey: KelThuzadPhaseKeyP2,
			Timestamp:  m.Date(),
		})
	}

	return c.PermanentDeath.Process(m)
}

func NewKelThuzadRoom(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if !isKelThuzadEntry(entry) {
		return nil, false
	}

	r, ok := characters.NewRoomMechanic(id, kelThuzadEntry, all)
	if !ok {
		return nil, false
	}

	if entry == kelThuzadEntry {
		boss := &kelThuzad{
			PermanentDeath: characters.NewPermanentDeath(r),
			room:           r,
			all:            all,
		}
		return characters.NewAdsGoWithBossCustomCharacter(
			boss,
			all,
			kelThuzadEntry,
			guardianOfIcecrownEntry,
		), true
	}

	return r, true
}

func isKelThuzadEntry(entry uint32) bool {
	switch entry {
	case kelThuzadEntry,
		soldierOfTheFrozenWaste,
		soulWeaver,
		unstoppableAbominationEntry:
		return true
	default:
		return false
	}
}
