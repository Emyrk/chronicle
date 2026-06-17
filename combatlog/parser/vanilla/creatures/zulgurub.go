package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

const (
	highPriestessJeklik = 14517
	bloodSeekerBat      = 11368
)

func NewHighPriestessJeklik(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(highPriestessJeklik,
		bloodSeekerBat,
		14965, // bat riders
	)(id, all)
}

const (
	highPriestMarli = 14510
	venomBrood      = 14532
)

func NewHighPriestMarli(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(highPriestMarli, venomBrood)(id, all)
}

const (
	highPriestArlokk = 14515
	zulianProwler    = 15101
)

func NewHighPriestArlokk(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(highPriestArlokk, zulianProwler)(id, all)
}

// NewJindoHexxer handles the "Sacrificed Trolls". Idk what is going on, maybe it
// is a range issue? But they are not always seen to be killed.
// They are insignificant, so just kill them with the boss.
func NewJindoHexxer(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(11380, 14826)(id, all)
}

type HighPriestThekalParty struct {
	*characters.Common
	all *characters.Characters

	// pendingDeath records a death event that may be reversed by resurrection.
	// If we see activity within resurrectionWindow after this timestamp, we
	// clear pendingDeath and stay active. Otherwise, we trim back to this death.
	pendingDeath *messages.Message
}

const (
	// resurrectionWindow is how long to wait for resurrection activity after death.
	// In Thekal's phase 1, zealots can resurrect each other within ~10s.
	resurrectionWindow = 15 * time.Second
)

const (
	highPriestThekal = 14599
	zealotZath       = 11348
	zealotLorKhan    = 11347
)

func NewHighPriestThekalParty(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	switch entry {
	case zealotZath, zealotLorKhan, highPriestThekal:
	// in the party!
	default:
		return nil, false
	}

	return &HighPriestThekalParty{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

func (c *HighPriestThekalParty) Process(m messages.Message) error {
	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	// Check if pending death should be finalized (no resurrection occurred)
	c.checkPendingDeath(m)

	return characters.ProcessCommonActivity(c, m)
}

// checkPendingDeath finalizes a pending death if the resurrection window has passed.
func (c *HighPriestThekalParty) checkPendingDeath(m messages.Message) {
	if c.pendingDeath == nil {
		return
	}

	deathTime := (*c.pendingDeath).Date()
	if m.Date().Sub(deathTime) >= resurrectionWindow {
		// No resurrection occurred within the window - finalize the death
		c.finalizeDeath()
	}
}

// finalizeDeath ends the current period at the pending death timestamp.
func (c *HighPriestThekalParty) finalizeDeath() {
	if c.pendingDeath == nil {
		return
	}

	deathMsg := *c.pendingDeath
	c.pendingDeath = nil
	c.Common.Died("zealot_death_finalized", deathMsg)
}

// Died handles the death of Thekal and his zealots.
// During phase 1, deaths are "pending" - if we see activity within the
// resurrection window, the death is cancelled. Otherwise, it's finalized.
func (c *HighPriestThekalParty) Died(_ string, m messages.Message) {
	// Record death as pending - will be finalized if no resurrection occurs
	c.pendingDeath = &m
	c.LastSlain = m
}

// Start overrides Common.Start to handle resurrection detection.
// If we see activity while death is pending, the unit was resurrected.
func (c *HighPriestThekalParty) Start(reason string, m messages.Message) {
	if c.pendingDeath != nil {
		// Activity after death = resurrection occurred, cancel the pending death
		c.pendingDeath = nil
	}
	c.Common.Start(reason, m)
}

const (
	hooktooth = 11374
)

type HooktoothFrenzy struct {
	*characters.Common
}

func NewHooktoothFrenzy(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}
	entry, ok := id.GetEntry()
	if !ok || entry != hooktooth {
		return nil, false
	}
	return &HooktoothFrenzy{
		characters.NewCommonCharacter(id, all),
	}, true
}

func (c *HooktoothFrenzy) Process(m messages.Message) error {
	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		if cur.HandleTimeout(m.Date()) {
			// We treat timeouts as deaths for these fish.
			// They are insignificant, and they can't exit the water, so they just time out.
			cur.EndState = period.EndStateSlain
		}
	}

	err := characters.ProcessCommonActivity(c, m)
	if err != nil {
		return err
	}

	return nil
}
