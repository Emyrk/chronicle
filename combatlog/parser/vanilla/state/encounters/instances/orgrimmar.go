package instances

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/trainingdummies"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

func cityFilter(id guid.GUID) bool {
	if trainingdummies.IsTrainingDummy(id) {
		return true
	}

	entry, ok := id.GetEntry()
	if !ok {
		return false
	}

	switch entry {
	case 6466: // Gamon
		return true
	}
	return false
}

// newTrainingDummyFilter returns a message filter that only keeps messages
// involving training dummies or units that have previously interacted with one.
func newTrainingDummyFilter() func(m messages.Message) bool {
	var me guid.GUID

	return func(m messages.Message) bool {
		switch ty := m.(type) {
		case *messages.Realm, *messages.Zone, *messages.Slain:
			return true
		case *messages.Combatant:
			if ty.IsMe() {
				//me = ty.Guid
			}
			return true
		case *messages.Unit:
			if ty.IsMe() {
				me = ty.Guid
			}
			return true
		}

		affected := m.Affects()
		for _, id := range affected {
			if !(cityFilter(id) || id == me) {
				return false
			}
		}

		return true
	}
}

// TrainingDummy creates an TrainingDummy instance that filters messages to only
// include training dummy interactions and units engaged with them.
func TrainingDummy(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Hookable {
	factory := &CommonFactory{
		Name:     "TrainingDummy",
		ZoneName: ZoneNameMatcher("orgrimmar"),
		Hostiles: FromMap(OrgrimmarHostiles()),
	}

	h := factory.NewHookable(ctx, logger, db, z)
	h.messageFilter = newTrainingDummyFilter()
	return h
}
