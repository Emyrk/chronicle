package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

const (
	bloodaxeWorgPupEntry  uint32 = 10221
	captureWorgPupSpellID        = 15998
	worgPupCapturesKey           = "worg_pup_captures"
	worgPupCaptureTimeout        = 5 * time.Minute
)

// worgPupCaptures is the shared state value stored under worgPupCapturesKey.
type worgPupCaptures struct {
	count     int
	touchedAt time.Time
}

type BloodaxeWorgPup struct {
	*characters.Common
	all *characters.Characters
}

func NewVanillaPlusBloodaxeWorgPup(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}
	if entry, ok := id.GetEntry(); !ok || entry != bloodaxeWorgPupEntry {
		return nil, false
	}

	base := characters.NewCommonCharacter(id, all)

	// V+ has a quest where you can "capture" a pup.
	return &BloodaxeWorgPup{
		Common: base,
		all:    all,
	}, true
}

func (c *BloodaxeWorgPup) Process(m messages.Message) error {
	// Run default common processing (inactivity timeout, activity tracking).
	// This also handles slain messages, making the pup inactive on death.
	if err := c.Common.Process(m); err != nil {
		return err
	}

	// After either a capture (counter went up) or a pup death (active count
	// went down), check whether the remaining active pups are all accounted
	// for by captures and end them.
	switch msg := m.(type) {
	case *messages.SpellGo:
		if msg.SpellData != nil && msg.SpellData.ID == captureWorgPupSpellID {
			state := c.loadCaptures(m.Date())
			state.count++
			state.touchedAt = m.Date()
			c.all.Save(worgPupCapturesKey, state)
			c.checkCaptures(m)
		}

	case *messages.Slain:
		if msg.Victim == c.ID() {
			c.checkCaptures(m)
		}
	}

	return nil
}

// loadCaptures returns the current capture state, resetting if the timeout
// has elapsed since the last capture.
func (c *BloodaxeWorgPup) loadCaptures(now time.Time) *worgPupCaptures {
	if v, ok := c.all.Load(worgPupCapturesKey); ok {
		state := v.(*worgPupCaptures)
		if now.Sub(state.touchedAt) < worgPupCaptureTimeout {
			return state
		}
		// Stale — reset.
		c.all.Delete(worgPupCapturesKey)
	}
	return &worgPupCaptures{}
}

// checkCaptures ends all remaining active worg pups when the number of
// captures is >= the number still alive.
func (c *BloodaxeWorgPup) checkCaptures(m messages.Message) {
	state := c.loadCaptures(m.Date())
	if state.count == 0 {
		return
	}

	activePups := 0
	for _, ch := range c.all.ByEntry[bloodaxeWorgPupEntry] {
		if ch.IsActive() {
			activePups++
		}
	}

	if activePups > 0 && activePups <= state.count {
		for _, ch := range c.all.ByEntry[bloodaxeWorgPupEntry] {
			if ch.IsActive() {
				ch.Died("captured", m)
			}
		}
		c.all.Delete(worgPupCapturesKey)
	}
}

func NewMotherSmolderweb(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}
	if entry, ok := id.GetEntry(); !ok || entry != 10596 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.SetRecentlySlainDuration(time.Second * 10)
	return c, true
}
