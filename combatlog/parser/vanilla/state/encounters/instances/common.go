package instances

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

type FinalizedInstance struct {
	Realm        *realm.Info
	Versions     map[string]string
	RecorderGUID *guid.GUID
	Encounters   []Encounter
	Guilds       *armory.Tracker
	Loot         *loot.LootTracker
	Participants *participants.Tracker
	Rankings     *rankings.RankingsResult
}

func ZoneNameMatcher(names ...string) func(z string) bool {
	return func(z string) bool {
		for _, name := range names {
			if z == name {
				return true
			}
		}
		return false
	}
}

type CommonFactory struct {
	Name           string
	ZoneName       func(z string) bool
	OtherZoneNames []string
	Hostiles       func() *Identifier
	Rankings       *rankings.Rankings
}

// New handles all the extra hooks
func (f *CommonFactory) New(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Hookable {
	return f.NewHookable(ctx, logger, db, z)
}
