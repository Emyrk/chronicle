package cleusource

import (
	"bufio"
	"context"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestNativeScannerPaddingAndFailures(t *testing.T) {
	t.Parallel()
	for _, format := range []database.LogFormat{database.LogFormat243CcAddon, database.LogFormat335aCcAddon} {
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()
			flavor := database.FlavorWrath
			if format == database.LogFormat243CcAddon {
				flavor = database.FlavorTBC
			}
			ctx := parsectx.With(context.Background(), parsectx.Context{Format: format, Flavor: database.WoWFlavor{flavor}})
			const record = "1/1 00:00:00.000  UNIT_DIED,0x0000000000000001,Player,0x400,0x0000000000000002,Target,0x400\n"
			padding := strings.Repeat("\x00", 3*bufio.MaxScanTokenSize)
			for _, tc := range []struct {
				name  string
				input io.Reader
				count int
				fatal bool
			}{
				{"padding around records", strings.NewReader(padding + record + padding + record + padding), 2, false},
				{"padding only", strings.NewReader(padding), 0, false},
				{"oversized nonNUL", strings.NewReader(padding + strings.Repeat("x", bufio.MaxScanTokenSize)), 0, true},
				{"reader failure after padding", io.MultiReader(strings.NewReader(padding+record+padding), failedReader{}), 1, true},
			} {
				t.Run(tc.name, func(t *testing.T) {
					p, err := New(ctx, nil, stateSpells{}, cleu.NewDecoder)
					require.NoError(t, err)
					source, err := p.OpenFile(tc.input, bufio.MaxScanTokenSize)
					require.NoError(t, err)
					for range tc.count {
						batch, err := source.Advance(ctx)
						require.NoError(t, err)
						require.NotEmpty(t, batch)
					}
					_, err = source.Advance(ctx)
					if tc.fatal {
						require.True(t, parseerrors.IsFatalError(err), "%v", err)
						_, again := source.Advance(ctx)
						require.Equal(t, err, again)
						_, err = p.CaptureState()
						require.Error(t, err)
					} else {
						require.ErrorIs(t, err, io.EOF)
						_, err = p.CaptureState()
						require.NoError(t, err)
					}
				})
			}
		})
	}
}
