package database_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestListGuildsWithPagesFiltersRealmBeforePagination(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t)

	serverID := uuid.New()
	_, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID:   serverID,
		Name: "Guild pagination test server " + serverID.String(),
	})
	require.NoError(t, err)

	newRealm := func(name string) uuid.UUID {
		realmID := uuid.New()
		_, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
			ID:       realmID,
			ServerID: serverID,
			Name:     name,
		})
		require.NoError(t, err)
		return realmID
	}

	targetRealmID := newRealm("Target realm")
	otherRealmID := newRealm("Other realm")
	createdAt := database.Timestamptz(time.Now())

	for i := range 20 {
		_, err := db.UpsertGuild(ctx, database.UpsertGuildParams{
			RealmID:   targetRealmID,
			Name:      fmt.Sprintf("Target Guild %02d", i),
			CreatedAt: createdAt,
		})
		require.NoError(t, err)

		_, err = db.UpsertGuild(ctx, database.UpsertGuildParams{
			RealmID:   otherRealmID,
			Name:      fmt.Sprintf("Other Guild %02d", i),
			CreatedAt: createdAt,
		})
		require.NoError(t, err)
	}

	total, err := db.CountGuilds(ctx, database.CountGuildsParams{
		RealmID: targetRealmID,
	})
	require.NoError(t, err)
	require.EqualValues(t, 20, total)

	guilds, err := db.ListGuildsWithPages(ctx, database.ListGuildsWithPagesParams{
		RealmID:     targetRealmID,
		ResultLimit: 15,
	})
	require.NoError(t, err)
	require.Len(t, guilds, 15)
	for _, guild := range guilds {
		require.Equal(t, targetRealmID, guild.RealmID)
	}
}
