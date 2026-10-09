package instances

import (
	"context"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var assemblyOfIronRankingEntries = map[uint32]struct{}{
	32857: {}, // Stormcaller Brundir
	32867: {}, // Steelbreaker
	32927: {}, // Runemaster Molgeim
	33692: {}, // Runemaster Molgeim (alternate)
	33693: {}, // Steelbreaker (alternate)
	33694: {}, // Stormcaller Brundir (alternate)
}

// assemblyRankedDamage defers damage serialization until each council phase is
// resolved. Damage to the member that dies ranks normally; damage to surviving
// members is retained in the event stream with zero ranking contribution.
type assemblyRankedDamage struct {
	instancehook.BaseHook
	phaseDamage map[guid.GUID][]*messages.Damage
}

func newAssemblyRankedDamage() *assemblyRankedDamage {
	return &assemblyRankedDamage{
		phaseDamage: make(map[guid.GUID][]*messages.Damage),
	}
}

func (a *assemblyRankedDamage) FightStarted(uuid.UUID, messages.Message) {
	clear(a.phaseDamage)
}

func (a *assemblyRankedDamage) ProcessMessage(active bool, _ uuid.UUID, msg messages.Message) error {
	if !active {
		return nil
	}

	switch event := msg.(type) {
	case *messages.Damage:
		if !isAssemblyOfIronRankingTarget(event.Target) {
			return nil
		}
		event.RankedDamagePending = true
		a.phaseDamage[event.Target] = append(a.phaseDamage[event.Target], event)
	case *messages.Slain:
		if !isAssemblyOfIronRankingTarget(event.Victim) {
			return nil
		}
		a.resolvePhase(event.Victim)
	}
	return nil
}

func (a *assemblyRankedDamage) FightEnded(uuid.UUID, messages.Message) {
	// An unresolved phase, such as a wipe or missing death event, keeps nil
	// RankedDamage values and therefore falls back to legacy ranking behavior.
	clear(a.phaseDamage)
}

func (a *assemblyRankedDamage) Finalize(context.Context) error { return nil }

func (a *assemblyRankedDamage) resolvePhase(killTarget guid.GUID) {
	for target, events := range a.phaseDamage {
		for _, event := range events {
			rankedDamage := int64(0)
			if target == killTarget {
				rankedDamage = combatmetrics.EffectiveDamage(event)
			}
			event.RankedDamage = &rankedDamage
		}
	}
	clear(a.phaseDamage)
}

func isAssemblyOfIronRankingTarget(id guid.GUID) bool {
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}
	_, ok = assemblyOfIronRankingEntries[entry]
	return ok
}
