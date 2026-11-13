package wotlk_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestNewDecoderRequiresExplicitWrathContext(t *testing.T) {
	t.Parallel()
	_, err := wotlk.NewDecoder(wotlk.DecoderContext{Format: database.LogFormat335aCcAddon}, cleu.Hooks{})
	require.ErrorContains(t, err, "flavor is required")
	_, err = wotlk.NewDecoder(wotlk.DecoderContext{Format: database.LogFormatV22Cleu, Flavor: database.WoWFlavor{database.FlavorWrath}}, cleu.Hooks{})
	require.ErrorContains(t, err, "does not accept format")
	for _, format := range []database.LogFormat{database.LogFormat335aCcAddon, database.LogFormatAzerothcoreMod} {
		_, err = wotlk.NewDecoder(wotlk.DecoderContext{Format: format, Flavor: database.WoWFlavor{database.FlavorWrath}}, cleu.Hooks{})
		require.NoError(t, err)
	}
}
