package instances

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

var orgrimmarDummyEntries = map[uint32]struct{}{
	2673: {},
	5652: {},
	2674: {},
}

func isTrainingDummy(id guid.GUID) bool {
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}
	_, isDummy := orgrimmarDummyEntries[entry]
	return isDummy
}

// newTrainingDummyFilter returns a message filter that only keeps messages
// involving training dummies or units that have previously interacted with one.
func newTrainingDummyFilter() func(m messages.Message) bool {
	engagedUnits := make(map[guid.GUID]struct{})

	return func(m messages.Message) bool {
		affected := m.Affects()
		switch m.(type) {
		case *messages.Realm, *messages.Combatant:
			return true
		}

		for _, id := range affected {
			if isTrainingDummy(id) {
				for _, otherid := range affected {
					engagedUnits[otherid] = struct{}{}
				}
				return true
			}

			if _, ok := engagedUnits[id]; ok {
				return true
			}
		}

		return false
	}
}

// Orgrimmar creates an Orgrimmar instance that filters messages to only
// include training dummy interactions and units engaged with them.
func Orgrimmar(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Hookable {
	factory := &CommonFactory{
		Name:     "Orgrimmar",
		ZoneName: ZoneNameMatcher("orgrimmar"),
		Hostiles: FromMap(OrgrimmarHostiles()),
	}

	h := factory.NewHookable(ctx, logger, db, z)
	h.messageFilter = newTrainingDummyFilter()
	return h
}
