package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRecentWindowDays(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
		want  int
	}{
		{name: "default", want: 14},
		{name: "invalid", value: "nope", want: 14},
		{name: "zero", value: "0", want: 14},
		{name: "negative", value: "-1", want: 14},
		{name: "custom", value: "60", want: 60},
		{name: "maximum", value: "365", want: 365},
		{name: "clamped", value: "366", want: 365},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, recentWindowDays(test.value))
		})
	}
}

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
