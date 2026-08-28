package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const (
	hodirEntry          uint32 = 32845
	hodirAlternateEntry uint32 = 32846
)

var hodirBossEntries = map[uint32]struct{}{
	hodirEntry:          {},
	hodirAlternateEntry: {},
}

type hodirCharacter struct {
	*characters.Common
}

func NewHodirEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	if _, ok := hodirBossEntries[entry]; !ok {
		return nil, false
	}

	return &hodirCharacter{Common: characters.NewCommonCharacter(id, all)}, true
}

func (c *hodirCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}

	if damage, ok := m.(*messages.Damage); ok && damage.Target == c.ID() && isHodirDefeatHit(damage) {
		c.Died("hodir_defeated", damage)
	}

	return nil
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
