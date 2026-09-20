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
)

func TestUserFavorites(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t)

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

	for range 2 {
		require.NoError(t, db.AddUserFavoriteGuild(ctx, database.AddUserFavoriteGuildParams{
			UserID:  userID,
			GuildID: guild.ID,
		}))
		require.NoError(t, db.AddUserFavoritePlayer(ctx, database.AddUserFavoritePlayerParams{
			UserID:        userID,
			CharacterGuid: characterGUID,
			RealmID:       realm.ID,
		}))
	}

	guilds, err := db.ListUserFavoriteGuilds(ctx, userID)
	require.NoError(t, err)
	require.Len(t, guilds, 1)
	require.Equal(t, guild.ID, guilds[0].ID)
	require.Equal(t, "Favorites Realm", guilds[0].RealmName)

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
	require.NoError(t, db.DeleteUserFavoriteGuild(ctx, database.DeleteUserFavoriteGuildParams{
		UserID:  userID,
		GuildID: guild.ID,
	}))

	guilds, err = db.ListUserFavoriteGuilds(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, guilds)
	playersList, err = db.ListUserFavoritePlayers(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, playersList)
}
