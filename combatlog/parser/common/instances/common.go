package instances

import (
	"context"
	"log/slog"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
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
	// RankingRules carries the eligibility rules (level range, etc.) for this instance.
	// Nil if this instance has no ranking configuration.
	RankingRules *rankings.Rankings
	// UnknownUnits maps creature entry IDs not in the hostiles map to their name and hit count.
	UnknownUnits map[uint32]UnknownUnit
}

type CommonFactory struct {
	Name      string
	MultiZone bool

	// DerivedName allows changing the name dynamically based on the fight data.
	// If 2 or more instances share the same zone.
	DerivedName *MultiInstanceZone
	ZoneNames   []string
	MapIDs      []uint32
	Hostiles    func() *identifier.Identifier
	Rankings    *rankings.Rankings
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
func (f *CommonFactory) New(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Hookable {
	h := f.NewHookable(ctx, logger, db, z)
	if f.DerivedName != nil {
		h.derivedName = f.DerivedName
	}
	return h
}
