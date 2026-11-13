package modern

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestExplicitFormatAndFlavor(t *testing.T) {
	t.Parallel()
	_, err := NewNormalizer(t.Context())
	require.Error(t, err)
	for _, metadata := range []parsectx.Context{
		{Format: database.LogFormatV9Cleu},
		{Flavor: database.WoWFlavor{database.FlavorVanilla}},
		{Format: database.LogFormat112aCcAddon, Flavor: database.WoWFlavor{database.FlavorVanilla}},
	} {
		_, err := NewNormalizer(parsectx.With(t.Context(), metadata))
		require.Error(t, err)
	}
	flavor := database.WoWFlavor{database.FlavorTBC}
	n, err := NewNormalizer(parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormatV22Cleu, Flavor: flavor}))
	require.NoError(t, err)
	flavor[0] = database.FlavorVanilla
	require.Equal(t, database.WoWFlavor{database.FlavorTBC}, n.Flavor())
	copyFlavor := n.Flavor()
	copyFlavor[0] = database.FlavorVanilla
	require.Equal(t, database.WoWFlavor{database.FlavorTBC}, n.Flavor())
	_, err = n.Normalize(`9/20/2026 15:02:05.988-5  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0,BUILD_VERSION,1.60.1,PROJECT_ID,18`)
	require.NoError(t, err)
	require.Equal(t, database.WoWFlavor{database.FlavorTBC}, n.Flavor(), "headers never infer flavor")
}
