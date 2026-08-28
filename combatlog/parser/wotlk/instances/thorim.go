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
// from opening or extending a Thorim pull before players engage. The damage is
// still retained in the event stream; only character activity is suppressed.
type thorimArenaStarterCombat struct{}

func (*thorimArenaStarterCombat) ProcessMessage(msg messages.Message) error {
	damage, ok := msg.(*messages.Damage)
	if !ok || damage.Caster == nil {
		return nil
	}

	if !isThorimArenaStarter(*damage.Caster) || !isThorimArenaStarter(damage.Target) {
		return nil
	}

	damage.MarkActivityIgnore("scripted Thorim arena combat", *damage.Caster)
	damage.MarkActivityIgnore("scripted Thorim arena combat", damage.Target)
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
