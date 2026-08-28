package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const freyaEntry uint32 = 32906

type freyaCharacter struct {
	*characters.Common
	defeat *characters.ScriptedDefeatDetector
}

func NewFreyaEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != freyaEntry {
		return nil, false
	}

	return &freyaCharacter{
		Common: characters.NewCommonCharacter(id, all),
		defeat: characters.NewScriptedDefeatDetector(id, scriptedSurrenderWithAuraCleanupConfig()),
	}, true
}

func (c *freyaCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}

	if signal, defeated := c.defeat.Observe(m, c.IsActive()); defeated {
		c.Died("freya_defeated_"+string(signal), m)
	}
	return nil
}
