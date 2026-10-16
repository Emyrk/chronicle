package api

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/stretchr/testify/require"
)

func TestValidateThemePanelLayout(t *testing.T) {
	t.Parallel()

	for _, layout := range []string{"", "cards", "seamless"} {
		t.Run(layout, func(t *testing.T) {
			t.Parallel()
			require.NoError(t, validateTheme(chroniclesdk.GuildPageTheme{PanelLayout: layout}))
		})
	}

	err := validateTheme(chroniclesdk.GuildPageTheme{PanelLayout: "overlapping"})
	require.EqualError(t, err, `invalid panel layout: "overlapping"`)
}
