package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	sneedShredder = 642
	sneed         = 643
)

type SneedShredder struct {
	*characters.Common
	all *characters.Characters

	pendingDeath messages.Message
}

func NewSneedShredder(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	switch entry {
	case sneed:
	case sneedShredder:
	default:
		return nil, false
	}

	return &SneedShredder{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

func (*SneedShredder) Owner() (guid.GUID, bool) {
	// For some reason, Sneed in AzerothCore is owned by the shredder. This means
	// when the shredder dies, Sneed does too. That is incorrect. So break any
	// ownership logic right here.
	return 0, false
}

func (c *SneedShredder) Process(m messages.Message) error {
	if c.IsShredder() && c.pendingDeath != nil {
		sneeds, ok := c.all.ByEntry[sneed]
		if ok {
			for _, s := range sneeds {
				if s.IsActive() {
					// Now we can die! But we need to use the sneed timestamp to ensure
					// they overlap.
					c.Common.Died("sneed ejected", m)
					c.pendingDeath = nil
					break
				}
			}
		}
	}

	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	err := characters.ProcessCommonActivity(c, m)
	if err != nil {
		return err
	}

	if c.IsSneed() && c.IsActive() {
		// If Sneed is active, make sure the shredder is allowed to die
		shredders, ok := c.all.ByEntry[sneedShredder]
		if ok {
			for _, sh := range shredders {
				err = sh.Process(m)
				if err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (c *SneedShredder) Died(reason string, m messages.Message) {
	// Do not let the shredder die until Sneed is active.
	// This will put them in the same fight
	if c.IsShredder() {
		c.pendingDeath = m
		return
	}

	// Sneed is normal!
	c.Common.Died(reason, m)
}

func (c *SneedShredder) IsShredder() bool {
	return c.Is(sneedShredder)
}

func (c *SneedShredder) IsSneed() bool {
	return c.Is(sneed)
}

const (
	edwinVanCleef    = 639
	defiasBlackGuard = 636
)

// NewEdwinVanCleef is not perfect. Technically the first 2 guards do not despawn,
// and the second two do. But this is good enough for now. If you kill the boss,
// the logs will count it. Even if you wipe after :shrug:
func NewEdwinVanCleef(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(edwinVanCleef, defiasBlackGuard)(id, all)
}
