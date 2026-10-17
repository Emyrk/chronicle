package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	kologarnArmsweepStalkerEntry uint32 = 33661
	kologarnArmsweepStalkerName         = "Armsweep Stalker Kologarn"
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
	if entry == kologarnArmsweepStalkerEntry {
		stalker := characters.NewNamedNeverActive(id, all, kologarnArmsweepStalkerName)
		if bossID, ok := findKologarnBoss(all); ok {
			all.DB().UpdateOwner(id, bossID)
		}
		return stalker, true
	}
	if _, ok := kologarnBossEntries[entry]; !ok {
		return nil, false
	}

	for _, stalker := range all.ByEntry[kologarnArmsweepStalkerEntry] {
		all.DB().UpdateOwner(stalker.ID(), id)
	}
	return &kologarnCharacter{
		Common: characters.NewCommonCharacter(id, all),
		defeat: characters.NewScriptedDefeatDetector(id, kologarnDefeatConfig()),
	}, true
}

func findKologarnBoss(all *characters.Characters) (guid.GUID, bool) {
	var active, fallback guid.GUID
	_ = all.All.ForEach(func(character characters.Character) error {
		entry, ok := character.ID().GetEntry()
		if !ok {
			return nil
		}
		if _, ok := kologarnBossEntries[entry]; !ok {
			return nil
		}
		if character.IsActive() {
			active = character.ID()
		} else if fallback == 0 {
			fallback = character.ID()
		}
		return nil
	})
	if active != 0 {
		return active, true
	}
	return fallback, fallback != 0
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
