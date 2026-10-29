package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	hodirEntry          uint32 = 32845
	hodirAlternateEntry uint32 = 32846

	// Surrender removes Hodir's debuffs immediately after the final damage.
	// Observed wipe cleanup starts later, after the encounter resets.
	hodirAuraCleanupDamageWindow = 100 * time.Millisecond
)

var hodirBossEntries = map[uint32]struct{}{
	hodirEntry:          {},
	hodirAlternateEntry: {},
}

type hodirCharacter struct {
	*characters.Common
	defeat *characters.ScriptedDefeatDetector
}

func NewHodirEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := hodirBossEntries[entry]; !ok {
		return nil, false
	}

	config := scriptedSurrenderWithAuraCleanupConfig(scriptedKeeperAuraCleanupThreshold)
	config.AuraCleanup.DamageWindow = hodirAuraCleanupDamageWindow
	return &hodirCharacter{
		Common: characters.NewCommonCharacter(id, all),
		defeat: characters.NewScriptedDefeatDetector(id, config),
	}, true
}

func (c *hodirCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}

	if signal, defeated := c.defeat.Observe(m, c.IsActive()); defeated {
		c.Died("hodir_defeated_"+string(signal), m)
	}
	return nil
}
