package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGuildResourceAnalytics(t *testing.T) {
	t.Parallel()
	fixture := setupGuildPanelsTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)

	visitorA := uuid.New()
	visitorB := uuid.New()
	record := func(kind, key string, visitorID uuid.UUID) {
		t.Helper()
		require.NoError(t, fixture.store.RecordGuildResourceView(ctx, database.RecordGuildResourceViewParams{
			GuildID:      fixture.guildID,
			ResourceKind: kind,
			ResourceKey:  key,
			VisitorID:    visitorID,
		}))
	}

	record("instance", "stable-instance-slug", visitorA)
	record("instance", "stable-instance-slug", visitorA)
	record("instance", "stable-instance-slug", visitorB)
	record("guild_page", fixture.guildID.String(), visitorA)

	rows, err := fixture.store.GuildResourceAnalytics(ctx, database.GuildResourceAnalyticsParams{
		GuildID:      fixture.guildID,
		LookbackDays: 30,
	})
	require.NoError(t, err)
	require.Len(t, rows, 2)

	byKind := make(map[string]database.GuildResourceAnalyticsRow, len(rows))
	for _, row := range rows {
		byKind[row.ResourceKind] = row
	}
	require.Equal(t, int64(1), byKind["guild_page"].Views)
	require.Equal(t, int64(1), byKind["guild_page"].UniqueVisitors)
	require.Equal(t, int64(3), byKind["instance"].Views)
	require.Equal(t, int64(2), byKind["instance"].UniqueVisitors)
	require.Equal(t, "stable-instance-slug", byKind["instance"].ResourceName)
}

func TestDeleteExpiredGuildResourceVisitors(t *testing.T) {
	t.Parallel()
	fixture := setupGuildPanelsTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)

	_, err := fixture.pool.Exec(ctx, `
		INSERT INTO guild_resource_recent_visitors
			(guild_id, resource_kind, resource_key, visitor_id, viewed_on)
		VALUES ($1, 'guild_page', $2, $3, (now() AT TIME ZONE 'UTC')::date - 2)
	`, fixture.guildID, fixture.guildID.String(), uuid.New())
	require.NoError(t, err)

	require.NoError(t, fixture.store.DeleteExpiredGuildResourceVisitors(ctx))

	var count int
	require.NoError(t, fixture.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM guild_resource_recent_visitors WHERE guild_id = $1
	`, fixture.guildID).Scan(&count))
	require.Zero(t, count)
}
