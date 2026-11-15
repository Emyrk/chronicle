package cli

import (
	"bytes"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
	"log/slog"
	"strings"
	"testing"
)

func TestParserStartupIdentityWarning(t *testing.T) {
	for _, tc := range []struct {
		name, label      string
		warning, invalid bool
	}{
		{"exact", "", false, false}, {"development", "local-startup", true, false}, {"invalid", "invalid label", false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(version.ParserDevelopmentIdentityEnv, tc.label)
			var output bytes.Buffer
			identity, err := parserStartupIdentity(slog.New(slog.NewTextHandler(&output, nil)))
			if tc.invalid {
				require.Error(t, err)
				require.Empty(t, identity)
				require.Empty(t, output.String())
				return
			}
			require.NoError(t, err)
			if tc.warning {
				require.Equal(t, 1, strings.Count(output.String(), "level=WARN"))
				require.Contains(t, output.String(), "DEVELOPMENT")
				require.Contains(t, output.String(), "dev-sha256:")
				require.NotContains(t, output.String(), tc.label)
			} else {
				require.Empty(t, output.String())
			}
		})
	}
}
