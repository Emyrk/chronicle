package chronicle

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	blizzardmodern "github.com/Emyrk/chronicle/combatlog/parser/blizzard/modern"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestCLEUSourceExecutionIdentity(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	for _, format := range []database.LogFormat{database.LogFormat243CcAddon, database.LogFormat335aCcAddon, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc} {
		for _, engine := range []BaselineEngine{"", BaselineLegacy, BaselineParserNext} {
			t.Run(string(format)+"/"+string(engine), func(t *testing.T) {
				t.Parallel()
				ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: database.WoWFlavor{database.FlavorWrath}})
				source, err := newCLEUSource(ctx, engine, format, logger, strings.NewReader("9/3/2026 12:00:04.000-6  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0"), sessionGameDB{}, sessionGameDB{}, nil)
				require.NoError(t, err)
				native := format == database.LogFormat243CcAddon || format == database.LogFormat335aCcAddon
				if native {
					if engine == BaselineParserNext {
						require.IsType(t, (*wotlk.NextSource)(nil), source)
					} else {
						require.IsType(t, (*wotlk.Parser)(nil), source)
					}
				} else {
					if engine == BaselineParserNext {
						require.IsType(t, (*blizzardmodern.NextSource)(nil), source)
					} else {
						require.IsType(t, (*blizzardmodern.Parser)(nil), source)
					}
				}
			})
		}
	}
}
