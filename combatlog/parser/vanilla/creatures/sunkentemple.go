package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewAtalalDeathwalkerSpirit(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != 8317 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.WithTimeoutAsDeath()
	c.WithTimeout(time.Second * 3)
	return c, true
}
