package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	vanillaPlusMograine  = 25227
	vanillaPlusWhitemane = 25228
)

type vanillaPlusMograineCharacter struct {
	*characters.Common
	all                  *characters.Characters
	awaitingResurrection bool
	resurrected          bool
}

func NewVanillaPlusMograineCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != vanillaPlusMograine {
		return nil, false
	}

	return &vanillaPlusMograineCharacter{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

func (c *vanillaPlusMograineCharacter) Process(m messages.Message) error {
	if cur, ok := c.Activity.Current(); ok {
		cur.HandleTimeout(m.Date())
	}

	return characters.ProcessCommonActivity(c, m)
}

func (c *vanillaPlusMograineCharacter) Died(reason string, m messages.Message) {
	if !c.resurrected {
		// Mograine's phase-one death is part of the encounter. Keep him active
		// until Whitemane resurrects him so the death log does not split the fight.
		c.awaitingResurrection = true
		c.LastSlain = m
		return
	}

	c.Common.Died(reason, m)
}

func (c *vanillaPlusMograineCharacter) Start(reason string, m messages.Message) {
	if !c.IsActive() && !c.whitemaneActive() {
		// A wipe can reuse the same GUID on the next pull.
		c.awaitingResurrection = false
		c.resurrected = false
		c.LastSlain = nil
	}

	if c.awaitingResurrection && c.whitemaneActive() {
		c.awaitingResurrection = false
		c.resurrected = true
		c.LastSlain = nil
	}

	c.Common.Start(reason, m)
}

func (c *vanillaPlusMograineCharacter) whitemaneActive() bool {
	for _, whitemane := range c.all.ByEntry[vanillaPlusWhitemane] {
		if whitemane.IsActive() {
			return true
		}
	}
	return false
}

func NewVanillaPlusSMSoul(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 25246 {
		return nil, false
	}

	return characters.NewNeverActive(id), true
}

func NewVanillaPlusSMSoulHunter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 25245 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.WithTimeoutAsDeath()
	c.WithTimeout(time.Second * 30)
	return c, true
}

func NewVanillaPlusBrotherMicheal(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(25221, 25245)(id, all)
}

func NewVanillaPlusScarletCharger(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewDeathOnCast(35876, 25235, 25237)(id, all)
}

func NewVanillaPlusScarletSorcerer(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	// Seemingly cast polymorph on each other?
	return characters.NewIgnoreCast(25208,
		36158, // Polymorph Emote
		36157, // Polymorph CD
		36159, // Polymorph
	)(id, all)
}

func NewVanillaPlusScarletSharpshooter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 25233 {
		return nil, false
	}

	// TODO: Figure these out better
	c := characters.NewCommonCharacter(id, all)
	c.WithTimeoutAsDeath()
	c.WithTimeout(time.Second * 30)
	return c, true
}
