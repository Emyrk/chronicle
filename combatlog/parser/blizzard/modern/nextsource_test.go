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
