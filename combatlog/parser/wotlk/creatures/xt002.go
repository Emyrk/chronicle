package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"time"
)

type xt002Character struct {
	*characters.Common
	all *characters.Characters
}

func NewXT002(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || (entry != 33293 && entry != 33885) {
		return nil, false
	}
	base := characters.NewCommonCharacter(id, all)
	// Preserve the default boss suppression of lingering post-death effects.
	base.SetRecentlySlainDuration(45 * time.Second)
	return &xt002Character{Common: base, all: all}, true
}

func (c *xt002Character) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}
	if slain, ok := m.(*messages.Slain); ok && slain.Victim == c.ID() {
		// Normal mode leaves the heart alive. Close its activity with the boss,
		// not a timeout tail. This synthetic cleanup is NOT hard-mode evidence.
		// The link is one-way: killing the heart must never kill XT.
		bossPeriod, hasBossPeriod := c.CurrentPeriod()
		if !hasBossPeriod || bossPeriod.Start == nil {
			return nil
		}
		_ = c.all.All.ForEach(func(linked characters.Character) error {
			entry, ok := linked.ID().GetEntry()
			if !ok || (entry != 33329 && entry != 33995) {
				return nil
			}
			heartPeriod, exists := linked.CurrentPeriod()
			if !exists || heartPeriod.Start == nil || heartPeriod.EndState == period.EndStateSlain || heartPeriod.Start.Timestamp.Date().Before(bossPeriod.Start.Timestamp.Date()) {
				return nil
			}
			// Resolve only this pull's heart, never a historical wipe's heart.
			if !linked.IsActive() {
				base, ok := linked.(characters.CharacterBase)
				if !ok {
					return nil
				}
				base.Start("xt002_defeated", m)
			}
			linked.Died("xt002_defeated", m)
			return nil
		})
	}
	return nil
}
