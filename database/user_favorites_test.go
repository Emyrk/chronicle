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

	newGuild := func(t *testing.T, realmID uuid.UUID, name string) database.Guild {
		t.Helper()
		guild, err := db.UpsertGuild(ctx, database.UpsertGuildParams{
			RealmID:   realmID,
			Name:      name,
			CreatedAt: database.Timestamptz(time.Now()),
		})
		require.NoError(t, err)
		return guild
	}
	rootGuilds := []database.Guild{
		newGuild(t, realm.ID, "Favorite Guild 1"),
		newGuild(t, realm.ID, "Favorite Guild 2"),
		newGuild(t, realm.ID, "Favorite Guild 3"),
		newGuild(t, realm.ID, "Favorite Guild 4"),
	}

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
	tenantGuilds := []database.Guild{
		newGuild(t, tenantRealm.ID, "Tenant Guild 1"),
		newGuild(t, tenantRealm.ID, "Tenant Guild 2"),
		newGuild(t, tenantRealm.ID, "Tenant Guild 3"),
		newGuild(t, tenantRealm.ID, "Tenant Guild 4"),
	}

	characterGUID := guid.GUID(0x1234)
	players := db.UpsertPlayers(ctx, []database.UpsertPlayersParams{{
		ID:        characterGUID,
		RealmID:   realm.ID,
		GuildID:   uuid.NullUUID{UUID: rootGuilds[0].ID, Valid: true},
		Name:      "Favoriteplayer",
		Class:     database.WowPlayableClassMAGE,
		Gender:    database.WowPlayableGenderFemale,
		Race:      database.WowPlayableRaceGnome,
		Level:     60,
		UpdatedAt: database.Timestamptz(time.Now()),
	}})
	require.NoError(t, players.Close())

	for _, guilds := range [][]database.Guild{rootGuilds, tenantGuilds} {
		for i, guild := range guilds {
			favorited, err := db.AddUserFavoriteGuild(ctx, database.AddUserFavoriteGuildParams{
				UserID:  userID,
				GuildID: guild.ID,
			})
			require.NoError(t, err)
			require.True(t, favorited.Valid)
			require.Equal(t, i < 3, favorited.Bool)
		}
	}
	favorited, err := db.AddUserFavoriteGuild(ctx, database.AddUserFavoriteGuildParams{
		UserID:  userID,
		GuildID: rootGuilds[0].ID,
	})
	require.NoError(t, err)
	require.True(t, favorited.Valid && favorited.Bool, "favoriting the same guild should be idempotent")
	for range 2 {
		require.NoError(t, db.AddUserFavoritePlayer(ctx, database.AddUserFavoritePlayerParams{
			UserID:        userID,
			CharacterGuid: characterGUID,
			RealmID:       realm.ID,
		}))
	}

	guilds, err := db.ListUserFavoriteGuilds(ctx, userID)
	require.NoError(t, err)
	require.Len(t, guilds, 6)
	expectedGuildIDs := make([]uuid.UUID, 0, 6)
	for _, scopeGuilds := range [][]database.Guild{rootGuilds, tenantGuilds} {
		for _, guild := range scopeGuilds[:3] {
			expectedGuildIDs = append(expectedGuildIDs, guild.ID)
		}
	}
	actualGuildIDs := make([]uuid.UUID, 0, len(guilds))
	for _, guild := range guilds {
		actualGuildIDs = append(actualGuildIDs, guild.ID)
	}
	require.ElementsMatch(t, expectedGuildIDs, actualGuildIDs)

	playersList, err := db.ListUserFavoritePlayers(ctx, userID)
	require.NoError(t, err)
	require.Len(t, playersList, 1)
	require.Equal(t, characterGUID, playersList[0].ID)
	require.Equal(t, rootGuilds[0].ID, playersList[0].GuildID.UUID)
	require.Equal(t, "Favorite Guild 1", playersList[0].GuildName)

	require.NoError(t, db.DeleteUserFavoritePlayer(ctx, database.DeleteUserFavoritePlayerParams{
		UserID:        userID,
		CharacterGuid: characterGUID,
		RealmID:       realm.ID,
	}))
	for _, guildID := range expectedGuildIDs {
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
