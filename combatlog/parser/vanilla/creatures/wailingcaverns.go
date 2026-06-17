package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

// DiscipleOfNaralex is the WC escort. Technically we should watch for his death
// and maybe show him as slain? Or idk. For now we just ignore him.
type DiscipleOfNaralex struct {
	characters.NeverActive
}

func NewDiscipleOfNaralex(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsCreature() {
		return nil, false
	}

	if entry, _ := id.GetEntry(); entry != 3678 {
		return nil, false
	}

	return &DiscipleOfNaralex{
		characters.NewNeverActive(id),
	}, true
}
