package wotlk

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestNativeWrathDecoderConsumesParseContext(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	ctx := parsectx.With(t.Context(), parsectx.Context{
		Format: database.LogFormatAzerothcoreMod,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	})
	parser, err := New(ctx, logger, strings.NewReader(""), auraTestDB{}, auraTestDB{}, nil)
	require.NoError(t, err)
	require.Equal(t, database.LogFormatAzerothcoreMod, parser.format)
	require.Equal(t, database.WoWFlavor{database.FlavorWrath}, parser.flavor)
	require.NotNil(t, parser.semantic)

	// Wire syntax does not constrain the server's gameplay flavor tags.
	mixed := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormat335aCcAddon, Flavor: database.WoWFlavor{database.FlavorTBC}})
	mixedParser, err := New(mixed, logger, strings.NewReader(""), auraTestDB{}, auraTestDB{}, nil)
	require.NoError(t, err)
	require.Equal(t, database.WoWFlavor{database.FlavorTBC}, mixedParser.flavor)

	for _, metadata := range []parsectx.Context{
		{Format: database.LogFormat243CcAddon, Flavor: database.WoWFlavor{database.FlavorTBC}},
	} {
		_, err = New(parsectx.With(t.Context(), metadata), logger, strings.NewReader(""), auraTestDB{}, auraTestDB{}, nil)
		require.Error(t, err)
	}
}

func TestParsernextSemanticDecoderScopeExcludesModernAndAzerothCore(t *testing.T) {
	t.Parallel()
	const line = `1/14 20:40:08.481  SWING_DAMAGE,0x00000000000019CA,"Player",0x512,0xF1300023890000A9,"Target",0xa48,1000,0,1,0,0,0,nil,nil,nil`
	for _, format := range []database.LogFormat{database.LogFormatAzerothcoreMod, database.LogFormatV22Cleu} {
		format := format
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()
			parser := &Parser{
				format:    format,
				flavor:    database.WoWFlavor{database.FlavorWrath},
				guidNames: NewGUIDNames(),
			}
			timestamp, event, matched, err := ParseLine(line)
			require.NoError(t, err)
			decoded, err := parser.dispatch(timestamp, event, matched, line)
			require.NoError(t, err)
			require.Len(t, decoded, 1)
			require.Nil(t, parser.semantic)
		})
	}
}
