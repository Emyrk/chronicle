package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var thorimArenaStarterEntries = map[uint32]struct{}{
	32882: {}, // Jormungar Behemoth
	32883: {}, // Captured Mercenary Soldier (Horde)
	32885: {}, // Captured Mercenary Soldier (Alliance)
	32886: {}, // Dark Rune Acolyte
	32907: {}, // Captured Mercenary Captain (Horde)
	32908: {}, // Captured Mercenary Captain (Alliance)
}

// thorimArenaStarterCombat prevents the arena's scripted NPC-versus-NPC battle
// from opening or extending a Thorim pull before players engage. The events are
// still retained in the event stream; only character activity is suppressed.
type thorimArenaStarterCombat struct{}

func (*thorimArenaStarterCombat) ProcessMessage(msg messages.Message) error {
	var source, target guid.GUID
	switch event := msg.(type) {
	case *messages.Damage:
		if event.Caster == nil {
			return nil
		}
		source, target = *event.Caster, event.Target
	case *messages.Aura:
		if event.Source == nil {
			return nil
		}
		source, target = *event.Source, event.Target
	default:
		return nil
	}

	if !isThorimArenaStarter(source) || !isThorimArenaStarter(target) {
		return nil
	}

	activity, ok := msg.(interface {
		MarkActivityIgnore(string, guid.GUID)
	})
	if !ok {
		return nil
	}
	activity.MarkActivityIgnore("scripted Thorim arena combat", source)
	activity.MarkActivityIgnore("scripted Thorim arena combat", target)
	return nil
}

func isThorimArenaStarter(id guid.GUID) bool {
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}
	_, ok = thorimArenaStarterEntries[entry]
	return ok
}
