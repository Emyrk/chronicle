package instances

import (
	"context"
	"log/slog"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

// UnknownUnit represents a creature entry not found in the hostiles map.
type UnknownUnit struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type FinalizedInstance struct {
	Realm        *realm.Info
	Versions     map[string]string
	RecorderGUID *guid.GUID
	Encounters   []encounter.Encounter
	Guilds       *armory.Tracker
	Loot         *loot.LootTracker
	Participants *participants.Tracker
	Rankings     *rankings.RankingsResult
	Overview     overviewmetrics.Summary
	// RankingRules carries the eligibility rules (level range, etc.) for this instance.
	// Nil if this instance has no ranking configuration.
	RankingRules *rankings.Rankings
	// UnknownUnits maps creature entry IDs not in the hostiles map to their name and hit count.
	UnknownUnits    map[uint32]UnknownUnit
	VehicleMetadata vehicles.Metadata
}

type CommonFactory struct {
	Name      string
	MultiZone bool

	// NameFromZone allows changing the instance name from metadata available on
	// the zone event. It runs when the Hookable is created, before fights are parsed.
	NameFromZone func(context.Context, zone.Zone, database.WoWFlavor) string

	// DerivedName creates a per-instance resolver that can change the name
	// dynamically based on fight data and the selected flavor.
	DerivedName func(database.WoWFlavor) *MultiInstanceZone
	// DerivedRankings maps derived instance names to their ranking configuration.
	// When set alongside DerivedName, each sub-instance gets its own independent
	// speedrun tracker. Keys must match the names used in DerivedName.
	DerivedRankings map[string]func(database.WoWFlavor) *rankings.Rankings
	// BossCount overrides the encounter count inferred from speedrun requirements.
	BossCount        func(flavor database.WoWFlavor) *int
	ZoneNames        []string
	MapIDs           []uint32
	Hostiles         func(flavor database.WoWFlavor) *identifier.Identifier
	FlavoredRankings func(flavor database.WoWFlavor) *rankings.Rankings
	// Preprocessors creates fresh message preprocessors for each parsed instance.
	Preprocessors func() []instancehook.Preprocessor
}

// MatchZone returns true if z matches any of the factory's zone names
// (case-insensitive) or, when present, one of the instance map IDs.
func (f *CommonFactory) MatchZone(z zone.Zone) bool {
	for _, name := range f.ZoneNames {
		if strings.EqualFold(z.Name, name) {
			return true
		}
	}
	for _, mapID := range f.MapIDs {
		if z.MapID != 0 && z.MapID == mapID {
			return true
		}
	}
	return false
}

// New handles all the extra hooks
func (f *CommonFactory) New(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone, flavor database.WoWFlavor) *Hookable {
	h := f.NewHookable(ctx, logger, db, z, flavor)
	if f.DerivedName != nil {
		h.derivedName = f.DerivedName(flavor)
	}
	if f.DerivedRankings != nil {
		h.initDerivedRankings(flavor, f.DerivedRankings)
	}
	return h
}
