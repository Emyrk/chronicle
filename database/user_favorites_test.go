package database_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestUserFavorites(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "favorites-user",
		Email:    "favorites@example.com",
	})
	require.NoError(t, err)

	serverID := uuid.New()
	_, err = db.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID:   serverID,
		Name: "Favorites Server",
	})
	require.NoError(t, err)
	realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:       uuid.New(),
		ServerID: serverID,
		Name:     "Favorites Realm",
	})
	require.NoError(t, err)

	guild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID:   realm.ID,
		Name:      "Favorite Guild",
		CreatedAt: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)
	replacementGuild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID:   realm.ID,
		Name:      "Replacement Guild",
		CreatedAt: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)

	tenant, err := db.InsertTenant(ctx, database.InsertTenantParams{
		ID:               uuid.New(),
		Name:             "Favorites Tenant",
		Slug:             pgtype.Text{String: "favorites-tenant", Valid: true},
		IncludeInAll:     true,
		AvailableFormats: []string{},
	})
	require.NoError(t, err)
	tenantServerID := uuid.New()
	_, err = db.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID:   tenantServerID,
		Name: "Tenant Favorites Server",
	})
	require.NoError(t, err)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "UPDATE wow_servers SET tenant_id = $1 WHERE id = $2", tenant.ID, tenantServerID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)
	conn.Release()
	tenantRealm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:       uuid.New(),
		ServerID: tenantServerID,
		Name:     "Tenant Favorites Realm",
	})
	require.NoError(t, err)
	tenantGuild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID:   tenantRealm.ID,
		Name:      "Tenant Guild",
		CreatedAt: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)
	tenantReplacementGuild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID:   tenantRealm.ID,
		Name:      "Tenant Replacement Guild",
		CreatedAt: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)

	characterGUID := guid.GUID(0x1234)
	players := db.UpsertPlayers(ctx, []database.UpsertPlayersParams{{
		ID:        characterGUID,
		RealmID:   realm.ID,
		GuildID:   uuid.NullUUID{UUID: guild.ID, Valid: true},
		Name:      "Favoriteplayer",
		Class:     database.WowPlayableClassMAGE,
		Gender:    database.WowPlayableGenderFemale,
		Race:      database.WowPlayableRaceGnome,
		Level:     60,
		UpdatedAt: database.Timestamptz(time.Now()),
	}})
	require.NoError(t, players.Close())

	for _, guildID := range []uuid.UUID{
		guild.ID,
		guild.ID, // Favoriting the same guild is idempotent.
		replacementGuild.ID,
		tenantGuild.ID,
		tenantReplacementGuild.ID,
	} {
		require.NoError(t, db.AddUserFavoriteGuild(ctx, database.AddUserFavoriteGuildParams{
			UserID:  userID,
			GuildID: guildID,
		}))
	}
	for range 2 {
		require.NoError(t, db.AddUserFavoritePlayer(ctx, database.AddUserFavoritePlayerParams{
			UserID:        userID,
			CharacterGuid: characterGUID,
			RealmID:       realm.ID,
		}))
	}

	guilds, err := db.ListUserFavoriteGuilds(ctx, userID)
	require.NoError(t, err)
	require.Len(t, guilds, 2)
	require.ElementsMatch(t, []uuid.UUID{replacementGuild.ID, tenantReplacementGuild.ID}, []uuid.UUID{
		guilds[0].ID,
		guilds[1].ID,
	})

	playersList, err := db.ListUserFavoritePlayers(ctx, userID)
	require.NoError(t, err)
	require.Len(t, playersList, 1)
	require.Equal(t, characterGUID, playersList[0].ID)
	require.Equal(t, guild.ID, playersList[0].GuildID.UUID)
	require.Equal(t, "Favorite Guild", playersList[0].GuildName)

	require.NoError(t, db.DeleteUserFavoritePlayer(ctx, database.DeleteUserFavoritePlayerParams{
		UserID:        userID,
		CharacterGuid: characterGUID,
		RealmID:       realm.ID,
	}))
	for _, guildID := range []uuid.UUID{replacementGuild.ID, tenantReplacementGuild.ID} {
		require.NoError(t, db.DeleteUserFavoriteGuild(ctx, database.DeleteUserFavoriteGuildParams{
			UserID:  userID,
			GuildID: guildID,
		}))
	}

	guilds, err = db.ListUserFavoriteGuilds(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, guilds)
	playersList, err = db.ListUserFavoritePlayers(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, playersList)
}
