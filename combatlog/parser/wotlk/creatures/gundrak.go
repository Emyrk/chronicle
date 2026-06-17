package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// NewDrakkariFrenzy is for the fish
func NewDrakkariFrenzy(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 29834 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.WithTimeoutAsDeath()
	c.WithTimeout(time.Second * 10)
	return c, true
}
