package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

const (
	cthunBodyEntry = 15727
	cthunEyeEntry  = 15589

	giantClawTentacleEntry = 15728
	fleshTentacleEntry     = 15802
	eyeTentacleEntry       = 15726
	giantEyeTentacleEntry  = 15334
	clawTentacleEntry      = 15725

	cthunSharedStateKey = "cthun_shared_state"

	cthunTransitionWindow = 60 * time.Second
)

type CthunParty struct {
	*characters.Common
	all *characters.Characters

	entry        uint32
	pendingDeath *messages.Message
	eyeDone      bool
}

func NewCthun(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if entry != cthunBodyEntry && entry != cthunEyeEntry {
		return nil, false
	}

	timeout := characters.InactivityTimeout
	if entry == cthunEyeEntry {
		timeout = cthunTransitionWindow + (time.Second * 5)
	}
	c := &CthunParty{
		Common: characters.NewCommonCharacter(id, all).WithTimeout(timeout),
		all:    all,
		entry:  entry,
	}

	if entry == cthunBodyEntry {
		c := characters.NewAdsGoWithBossCustomCharacter(c,
			all,
			cthunBodyEntry,
			giantClawTentacleEntry,
			fleshTentacleEntry,
			eyeTentacleEntry,
			giantEyeTentacleEntry,
			clawTentacleEntry,
		)
		return c, true
	}

	all.Save(cthunSharedStateKey, c)
	return c, true
}

func (c *CthunParty) Process(m messages.Message) error {
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	err := characters.ProcessCommonActivity(c, m)
	if err != nil {
		return err
	}

	c.maybeFinalizePendingDeath(m)

	if c.entry == cthunBodyEntry && c.IsActive() {
		err = c.ProcessEyePending(m)
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *CthunParty) ProcessEyePending(m messages.Message) error {
	if c.eyeDone {
		return nil
	}

	eye, ok := c.all.Load(cthunSharedStateKey)
	if !ok {
		return nil
	}

	eyeCthun, ok := eye.(*CthunParty)
	if !ok {
		return nil
	}

	eyeCthun.maybeFinalizePendingDeath(m)
	c.all.Delete(cthunSharedStateKey)
	c.eyeDone = true
	return nil
}

func (c *CthunParty) Died(reason string, m messages.Message) {
	if c.entry == cthunEyeEntry {
		c.pendingDeath = &m
		c.LastSlain = m
		return
	}

	c.Common.Died(reason, m)
}

func (c *CthunParty) maybeFinalizePendingDeath(m messages.Message) {
	if c.pendingDeath == nil {
		return
	}

	if c.bodyActive() {
		c.finalizePendingDeath("cthun_phase_transition", m)
		return
	}

	deathTime := (*c.pendingDeath).Date()
	if m.Date().Sub(deathTime) >= cthunTransitionWindow {
		c.finalizePendingDeath("cthun_transition_timeout", m)
	}
}

func (c *CthunParty) bodyActive() bool {
	for _, body := range c.all.ByEntry[cthunBodyEntry] {
		if body.IsActive() {
			return true
		}
	}

	return false
}

func (c *CthunParty) finalizePendingDeath(reason string, m messages.Message) {
	c.Common.Died(reason, m)
	c.pendingDeath = nil
}
