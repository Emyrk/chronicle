package modern

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

type failingModernReader struct{}

func (failingModernReader) Read([]byte) (int, error) { return 0, errors.New("source read failed") }
func nextTestContext(t *testing.T, format database.LogFormat) context.Context {
	return parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: database.WoWFlavor{database.FlavorWoWForever}})
}
func TestNextSourceFatalReadAndNormalization(t *testing.T) {
	t.Parallel()
	for _, input := range []io.Reader{failingModernReader{}, strings.NewReader("missing separator"), strings.NewReader("9/9 12:00:00.000  PARTY_KILL,Player-bad,\"name\",0x1,0x0,nil,nil,0x0,0x0")} {
		source, err := NewNext(nextTestContext(t, database.LogFormatHermesproxy1142Cc), slog.Default(), input, hermesProxyTestDB{}, nil, nil)
		require.NoError(t, err)
		_, first := source.Advance(t.Context())
		require.True(t, parseerrors.IsFatalError(first), "%v", first)
		_, again := source.Advance(t.Context())
		require.Equal(t, first, again)
	}
}
func TestNextSourceV22Ordering(t *testing.T) {
	t.Parallel()
	for _, regression := range []string{"02", "00"} {
		input := strings.Join([]string{
			`9/3/2026 12:00:04.000-6  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0`,
			`9/3/2026 12:00:04.000-6  ENCOUNTER_START,1,"Boss",1,5`,
			`9/3/2026 13:00:00.000-6  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0`,
			`9/3/2026 12:00:` + regression + `.000-6  ENCOUNTER_END,1,"Boss",1,5,1`,
		}, "\n")
		source, err := NewNext(nextTestContext(t, database.LogFormatV22Cleu), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, nil, nil)
		require.NoError(t, err)
		var final error
		for {
			_, final = source.Advance(t.Context())
			if final != nil {
				break
			}
		}
		if regression == "02" {
			require.ErrorIs(t, final, io.EOF)
		} else {
			require.True(t, parseerrors.IsFatalError(final))
		}
	}
}

func TestNextSourceNULPaddingAndScannerFailures(t *testing.T) {
	t.Parallel()
	padding := strings.Repeat("\x00", 3*bufSize)
	for _, format := range []database.LogFormat{database.LogFormatHermesproxy1142Cc, database.LogFormatV9Cleu, database.LogFormatV22Cleu} {
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()
			record := "9/3 12:00:00.000  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,0\n"
			if format == database.LogFormatV9Cleu {
				record = "9/3/2026 12:00:00.000  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,0\n"
			}
			if format == database.LogFormatV22Cleu {
				record = "9/3/2026 12:00:00.000-6  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0\n"
			}
			for _, tc := range []struct {
				name  string
				input io.Reader
				fatal bool
			}{
				{"padding around records", strings.NewReader(padding + record + padding + record + padding), false},
				{"oversized record", strings.NewReader(record + padding + strings.Repeat("x", bufSize)), true},
				{"reader failure after padding", io.MultiReader(strings.NewReader(record+padding), failingModernReader{}), true},
			} {
				t.Run(tc.name, func(t *testing.T) {
					source, err := NewNext(nextTestContext(t, format), slog.Default(), tc.input, hermesProxyTestDB{}, nil, nil)
					require.NoError(t, err)
					var terminal error
					for range 10 {
						_, terminal = source.Advance(t.Context())
						if terminal != nil {
							break
						}
					}
					if tc.fatal {
						require.True(t, parseerrors.IsFatalError(terminal), "%v", terminal)
						_, again := source.Advance(t.Context())
						require.Equal(t, terminal, again)
						require.False(t, source.pipeline.completedFile)
					} else {
						require.ErrorIs(t, terminal, io.EOF)
						require.True(t, source.pipeline.completedFile)
					}
				})
			}
			if format != database.LogFormatHermesproxy1142Cc {
				for _, input := range []io.Reader{strings.NewReader(padding + strings.Repeat("x", bufSize)), io.MultiReader(strings.NewReader(padding), failingModernReader{})} {
					_, err := NewNext(nextTestContext(t, format), slog.Default(), input, hermesProxyTestDB{}, nil, nil)
					require.Error(t, err)
				}
			}
		})
	}
}
