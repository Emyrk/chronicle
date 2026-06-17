package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

// NewCryptScarab is for the small scarabs that I think are a mechanic of the boss fight
// Nerub'enkan in Stratholme.
// They seem temporary and don't do that much. I'm not sure what we should do
// with these long term.
func NewCryptScarab(me guid.GUID, lookup *characters.Characters) (characters.Character, bool) {
	entry, ok := me.GetEntry()
	if !ok {
		return nil, false
	}

	if entry != 10577 {
		return nil, false
	}

	return characters.NewNeverActive(me), true
}
