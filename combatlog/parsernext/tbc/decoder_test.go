package tbc_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/tbc"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestNewDecoderRequiresExplicitTBCContext(t *testing.T) {
	t.Parallel()
	_, err := tbc.NewDecoder(tbc.DecoderContext{Format: database.LogFormat243CcAddon}, cleu.Hooks{})
	require.ErrorContains(t, err, "flavor is required")
	_, err = tbc.NewDecoder(tbc.DecoderContext{Format: database.LogFormat112aCcAddon, Flavor: database.WoWFlavor{database.FlavorTBC}}, cleu.Hooks{})
	require.ErrorContains(t, err, "does not accept format")
	_, err = tbc.NewDecoder(tbc.DecoderContext{Format: database.LogFormat335aCcAddon, Flavor: database.WoWFlavor{database.FlavorTBC}}, cleu.Hooks{})
	require.NoError(t, err)
}
