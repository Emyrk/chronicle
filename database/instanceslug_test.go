package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInstanceSlug(t *testing.T) {
	t.Parallel()

	groupID := uuid.MustParse("2de16687-a173-4d55-913a-8a7e92c1129f")
	legacy := database.InstanceSlug(groupID, "Ulduar")
	instance10 := database.InstanceVariantSlug(groupID, "Ulduar", "10 Player", 10)
	instance25 := database.InstanceVariantSlug(groupID, "Ulduar", "25 Player", 25)
	differentDifficulty := database.InstanceVariantSlug(groupID, "Ulduar", "Heroic", 10)
	differentMaxPlayers := database.InstanceVariantSlug(groupID, "Ulduar", "10 Player", 25)
	ordinal0 := database.InstanceOrdinalSlug(groupID, "Ulduar", "10 Player", 10, 0)
	ordinal1 := database.InstanceOrdinalSlug(groupID, "Ulduar", "10 Player", 10, 1)

	require.NotEmpty(t, legacy)
	require.NotEqual(t, legacy, instance10)
	require.NotEqual(t, legacy, instance25)
	require.NotEqual(t, instance10, instance25)
	require.NotEqual(t, instance10, differentDifficulty)
	require.NotEqual(t, instance10, differentMaxPlayers)
	require.NotEqual(t, instance10, ordinal0)
	require.NotEqual(t, ordinal0, ordinal1)
	require.Equal(t, instance10, database.InstanceVariantSlug(groupID, "Ulduar", "10 Player", 10))
	require.Equal(t, ordinal0, database.InstanceOrdinalSlug(groupID, "Ulduar", "10 Player", 10, 0))
}
