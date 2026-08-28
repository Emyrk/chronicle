package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func NewHauntingSpirit(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 4958 {
		return nil, false
	}

	c := characters.NewNamedNeverActive(id, all, "Haunting Spirit")

	return c, true
}

type archmageArugal struct {
	characters.CharacterBase
}

func NewArchmageArgual(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 4275 {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)

	return &archmageArugal{
		CharacterBase: c,
	}, true
}

func (a *archmageArugal) Process(m messages.Message) error {
	switch ty := m.(type) {
	case *messages.SpellStart:
		if ty.Caster == a.ID() && !a.RecentlySlain(m) {
			a.Bump("casting", ty)
		}
	}

	return a.CharacterBase.Process(m)
}
