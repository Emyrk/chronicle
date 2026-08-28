package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var kologarnBossEntries = map[uint32]struct{}{
	32930: {},
	33909: {},
}

type kologarnCharacter struct {
	*characters.Common
	defeat *characters.ScriptedDefeatDetector
}

func NewKologarnEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := kologarnBossEntries[entry]; !ok {
		return nil, false
	}

	return &kologarnCharacter{
		Common: characters.NewCommonCharacter(id, all),
		defeat: characters.NewScriptedDefeatDetector(id, kologarnDefeatConfig()),
	}, true
}

func (c *kologarnCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}

	if signal, defeated := c.defeat.Observe(m, c.IsActive()); defeated {
		c.Died("kologarn_defeated_"+string(signal), m)
	}
	return nil
}
