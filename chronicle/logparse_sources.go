package chronicle

import (
	"context"
	"fmt"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	blizzardmodern "github.com/Emyrk/chronicle/combatlog/parser/blizzard/modern"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
)

type clockedParseSource interface {
	consumers.Advancer
	SetRealmClockInfo(*realmclock.Info)
	Metrics() vanilla.Metrics
	SawRaidGroup() bool
}

// newCLEUSource keeps actual engine selection testable independently of storage
// and publication. Empty/legacy selection never constructs a parsernext source.
func newCLEUSource(ctx context.Context, engine BaselineEngine, format database.LogFormat, logger *slog.Logger, input io.Reader, db gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (clockedParseSource, error) {
	switch format {
	case database.LogFormat243CcAddon, database.LogFormat335aCcAddon:
		if engine == BaselineParserNext {
			return wotlk.NewNext(ctx, logger, input, db, gear, reg)
		}
		return wotlk.NewLegacy(ctx, logger, input, db, gear, reg)
	case database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
		if engine == BaselineParserNext {
			return blizzardmodern.NewNext(ctx, logger, input, db, gear, reg)
		}
		if format == database.LogFormatHermesproxy1142Cc {
			return blizzardmodern.NewHermesProxy(ctx, logger, input, db, gear, reg)
		}
		return blizzardmodern.New(ctx, logger, input, db, gear, reg, format)
	default:
		return nil, fmt.Errorf("unsupported CLEU source format %q", format)
	}
}
