package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const (
	hodirEntry          uint32 = 32845
	hodirAlternateEntry uint32 = 32846

	hodirAuraCleanupThreshold    = 8
	hodirAuraCleanupBurstWindow  = 100 * time.Millisecond
	hodirAuraCleanupDamageWindow = 500 * time.Millisecond
)

var hodirBossEntries = map[uint32]struct{}{
	hodirEntry:          {},
	hodirAlternateEntry: {},
}

type hodirCharacter struct {
	*characters.Common

	lastIncomingDamage time.Time
	cleanupBurstStart  time.Time
	cleanupSpells      map[string]struct{}
}

func NewHodirEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := hodirBossEntries[entry]; !ok {
		return nil, false
	}

	return &hodirCharacter{
		Common:        characters.NewCommonCharacter(id, all),
		cleanupSpells: make(map[string]struct{}),
	}, true
}

func (c *hodirCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if err := c.Common.Process(m); err != nil {
		return err
	}
	if !wasActive && c.IsActive() {
		c.resetDefeatState()
	}

	switch event := m.(type) {
	case *messages.Damage:
		if event.Target != c.ID() {
			break
		}
		if isHodirDefeatHit(event) {
			c.Died("hodir_defeated", event)
			break
		}
		if isSuccessfulHodirDamage(event) {
			c.lastIncomingDamage = event.Date()
		}
	case *messages.Aura:
		if c.isHodirDefeatCleanup(event) {
			c.Died("hodir_defeated_cleanup", event)
		}
	}

	if wasActive && !c.IsActive() {
		c.resetDefeatState()
	}
	return nil
}

// Hodir's scripted surrender calls RemoveAllAuras. Some client logs omit both
// the triggering overkill and the queued evade hit, but still report the boss's
// debuffs disappearing in one burst. Require recent incoming damage and several
// distinct removals so ordinary aura expiry cannot end the encounter.
func (c *hodirCharacter) isHodirDefeatCleanup(aura *messages.Aura) bool {
	if !c.IsActive() || aura.Target != c.ID() || aura.State != types.AuraStateRemoved {
		return false
	}

	sinceDamage := aura.Date().Sub(c.lastIncomingDamage)
	if c.lastIncomingDamage.IsZero() || sinceDamage < 0 || sinceDamage > hodirAuraCleanupDamageWindow {
		c.resetCleanupBurst()
		return false
	}

	if c.cleanupBurstStart.IsZero() || aura.Date().Sub(c.cleanupBurstStart) > hodirAuraCleanupBurstWindow {
		c.resetCleanupBurst()
		c.cleanupBurstStart = aura.Date()
	}
	c.cleanupSpells[aura.SpellName] = struct{}{}
	return len(c.cleanupSpells) >= hodirAuraCleanupThreshold
}

func (c *hodirCharacter) resetDefeatState() {
	c.lastIncomingDamage = time.Time{}
	c.resetCleanupBurst()
}

func (c *hodirCharacter) resetCleanupBurst() {
	c.cleanupBurstStart = time.Time{}
	clear(c.cleanupSpells)
}

func isSuccessfulHodirDamage(damage *messages.Damage) bool {
	return damage.Amount > 0 &&
		!damage.HitType.Has(types.HitTypeImmune) &&
		!damage.HitType.Has(types.HitTypeEvade)
}

func isHodirDefeatHit(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	return ok && isHodirBossEntry(entry) &&
		(damage.Overkill > 0 || damage.HitType.Has(types.HitTypeEvade))
}

func isHodirBossEntry(entry uint32) bool {
	_, ok := hodirBossEntries[entry]
	return ok
}
