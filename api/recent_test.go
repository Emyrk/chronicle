package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTrimRecentInstanceGroups(t *testing.T) {
	t.Parallel()

	firstRunID := uuid.New()
	secondRunID := uuid.New()
	thirdRunID := uuid.New()
	rows := []database.ListRecentInstanceGroupsRow{
		{ID: uuid.New(), DuplicateGroupID: uuid.NullUUID{UUID: firstRunID, Valid: true}},
		{ID: uuid.New(), DuplicateGroupID: uuid.NullUUID{UUID: firstRunID, Valid: true}},
		{ID: secondRunID},
		{ID: thirdRunID},
	}

	trimmed, hasMore := trimRecentInstanceGroups(rows, 2)
	require.True(t, hasMore)
	require.Len(t, trimmed, 3)
	require.Equal(t, rows[:3], trimmed)

	unlimited, hasMore := trimRecentInstanceGroups(rows, 0)
	require.False(t, hasMore)
	require.Equal(t, rows, unlimited)

	allRows, hasMore := trimRecentInstanceGroups(rows, 4)
	require.False(t, hasMore)
	require.Equal(t, rows, allRows)
}
