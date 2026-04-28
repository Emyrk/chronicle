package cli

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestPrettifyInstanceScript(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Blackfathom Deeps", prettifyInstanceScript("instance_blackfathom_deeps"))
	require.Equal(t, "The Black Morass", prettifyInstanceScript("instance_the_black_morass"))
}

func TestWarmaneInstanceMetadataFallsBackByMapType(t *testing.T) {
	t.Parallel()

	meta := warmaneInstanceMetadata("instance_unknown_test", 603)
	require.Equal(t, "Unknown Test", meta.Name)
	require.Equal(t, database.InstanceCategoryRaid, meta.Category)

	meta = warmaneInstanceMetadata("instance_unknown_test", 33)
	require.Equal(t, database.InstanceCategoryDungeon, meta.Category)
}