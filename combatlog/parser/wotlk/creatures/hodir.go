package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	hodirEntry                    uint32 = 32845
	hodirAlternateEntry           uint32 = 32846
	hodirAuraCleanupDeathCooldown        = 3 * time.Second
)

var hodirBossEntries = map[uint32]struct{}{
	hodirEntry:          {},
	hodirAlternateEntry: {},
}

type hodirCharacter struct {
	*characters.Common
	defeat          *characters.ScriptedDefeatDetector
	lastPlayerDeath time.Time
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
		Common: characters.NewCommonCharacter(id, all),
		defeat: characters.NewScriptedDefeatDetector(id, scriptedSurrenderWithAuraCleanupConfig(scriptedKeeperAuraCleanupThreshold)),
	}, true
}

func (c *hodirCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}
	if slain, ok := m.(*messages.Slain); ok && slain.Victim.IsPlayer() {
		c.lastPlayerDeath = slain.Date()
	}

	if signal, defeated := c.defeat.Observe(m, c.IsActive()); defeated {
		if signal != characters.ScriptedDefeatAuraCleanup || c.auraCleanupAllowed(m.Date()) {
			c.Died("hodir_defeated_"+string(signal), m)
		}
	}
	return nil
}

func (c *hodirCharacter) Start(reason string, m messages.Message) {
	if !c.IsActive() {
		c.lastPlayerDeath = time.Time{}
		c.defeat.Reset()
	}
	c.Common.Start(reason, m)
}

func (c *hodirCharacter) auraCleanupAllowed(now time.Time) bool {
	return c.lastPlayerDeath.IsZero() || now.Sub(c.lastPlayerDeath) >= hodirAuraCleanupDeathCooldown
}
