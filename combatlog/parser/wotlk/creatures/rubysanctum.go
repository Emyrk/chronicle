package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var halionEntries = []uint32{
	39863, 39864, 39944, 39945,
	40142, 40143, 40144, 40145,
}

type halionCharacter struct {
	*characters.Common
	all *characters.Characters
}

// NewHalionCharacter links Halion's physical and twilight bodies. Warmane logs
// report a PARTY_KILL for both bodies at victory, but the twilight event arrives
// first. Ending both together prevents the encounter from closing as a reset
// before the physical body's kill event is processed.
func NewHalionCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || !halionEntry(entry) {
		return nil, false
	}
	return &halionCharacter{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

func (c *halionCharacter) Process(m messages.Message) error {
	if err := c.Common.Process(m); err != nil {
		return err
	}

	slain, ok := m.(*messages.Slain)
	if !ok || slain.Victim != c.ID() {
		return nil
	}
	markLinkedEntriesSlain(c.all, halionEntries, "halion_linked_body_slain", m)
	return nil
}

func halionEntry(entry uint32) bool {
	for _, candidate := range halionEntries {
		if entry == candidate {
			return true
		}
	}
	return false
}
