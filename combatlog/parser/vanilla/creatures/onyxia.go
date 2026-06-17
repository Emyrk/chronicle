package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

type Onyxia struct {
	*characters.Common
}

func NewOnyxiaCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	if entry != 10184 {
		return nil, false
	}

	return &Onyxia{
		Common: characters.NewCommonCharacter(id, all),
	}, true
}
