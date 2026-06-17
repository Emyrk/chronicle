package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type knownArmor struct {
	previous map[guid.GUID][]combatant.GearItem
}

func newKnownArmor() *knownArmor {
	return &knownArmor{}
}

func (r *knownArmor) ProcessMessages(msg []messages.Message) {
KnownArmorLoop:
	for _, m := range msg {
		switch ty := m.(type) {
		case *messages.Combatant:
			previous, ok := r.previous[ty.Guid]
			if ok {
				for _, item := range ty.GearSetups {
					if item.ItemID == 0 {
						// Look for thr first non-zero item.
						continue
					}

					// If we find a non-zero item, we can stop looking and keep the current gear setup.
					r.previous[ty.Guid] = ty.GearSetups
					continue KnownArmorLoop
				}
				ty.GearSetups = previous
			}
		}
	}
}
