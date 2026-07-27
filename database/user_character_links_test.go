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

func TestUserCharacterLinks(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	db, _ := dbtestutil.NewDB(t)

	newUser := func(t *testing.T, name string) uuid.UUID {
		t.Helper()
		id := uuid.New()
		_, err := db.InsertUser(ctx, database.InsertUserParams{
			ID:       id,
			Username: name,
			Email:    name + "@example.com",
		})
		require.NoError(t, err)
		return id
	}

	// Shared realm for all subtests.
	serverID := uuid.New()
	_, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID:   serverID,
		Name: "Test Server",
	})
	require.NoError(t, err)

	realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:       uuid.New(),
		ServerID: serverID,
		Name:     "Test Realm",
	})
	require.NoError(t, err)

	var nextGUID uint64 = 0x100
	newPlayer := func(t *testing.T, name string) guid.GUID {
		t.Helper()
		nextGUID++
		g := guid.GUID(nextGUID)
		res := db.UpsertPlayers(ctx, []database.UpsertPlayersParams{{
			ID:        g,
			RealmID:   realm.ID,
			Name:      name,
			Class:     database.WowPlayableClassWARRIOR,
			Gender:    database.WowPlayableGenderMale,
			Race:      database.WowPlayableRaceHuman,
			Level:     60,
			UpdatedAt: database.Timestamptz(time.Now()),
		}})
		require.NoError(t, res.Close())
		return g
	}

	link := func(t *testing.T, userID uuid.UUID, character guid.GUID) (database.UserCharacterLink, error) {
		t.Helper()
		return db.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{
			UserID:        userID,
			CharacterGuid: character,
			RealmID:       realm.ID,
		})
	}

	t.Run("LinkAndList", func(t *testing.T) {
		userID := newUser(t, "link-list")
		char := newPlayer(t, "Linklist")

		created, err := link(t, userID, char)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
		require.False(t, created.IsPrimary)

		rows, err := db.GetUserCharacterLinks(ctx, userID)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		require.Equal(t, char, rows[0].CharacterGuid)
		require.Equal(t, "Linklist", rows[0].Name)
		require.Equal(t, "Test Realm", rows[0].RealmName)
	})

	t.Run("Exclusivity", func(t *testing.T) {
		userA := newUser(t, "exclusive-a")
		userB := newUser(t, "exclusive-b")
		char := newPlayer(t, "Contested")

		_, err := link(t, userA, char)
		require.NoError(t, err)

		_, err = link(t, userB, char)
		require.Error(t, err)
		require.True(t, database.IsUniqueViolation(err, database.UniqueUserCharacterLinksCharacterGuidRealmIDKey))

		// After unlinking, the other account can claim it.
		_, err = db.DeleteUserCharacterLink(ctx, database.DeleteUserCharacterLinkParams{
			CharacterGuid: char,
			RealmID:       realm.ID,
		})
		require.NoError(t, err)

		_, err = link(t, userB, char)
		require.NoError(t, err)
	})

	t.Run("SinglePrimary", func(t *testing.T) {
		userID := newUser(t, "primary-user")
		charA := newPlayer(t, "Maintoon")
		charB := newPlayer(t, "Alttoon")

		_, err := link(t, userID, charA)
		require.NoError(t, err)
		_, err = link(t, userID, charB)
		require.NoError(t, err)

		_, err = db.SetPrimaryUserCharacter(ctx, database.SetPrimaryUserCharacterParams{
			UserID:        userID,
			CharacterGuid: charA,
			RealmID:       realm.ID,
		})
		require.NoError(t, err)

		// Setting a second primary without unsetting violates the partial
		// unique index.
		_, err = db.SetPrimaryUserCharacter(ctx, database.SetPrimaryUserCharacterParams{
			UserID:        userID,
			CharacterGuid: charB,
			RealmID:       realm.ID,
		})
		require.Error(t, err)
		require.True(t, database.IsUniqueViolation(err, database.UniqueUserCharacterLinksOnePrimary))

		// Unset then set works, and the list orders primary first.
		require.NoError(t, db.UnsetPrimaryUserCharacter(ctx, userID))
		_, err = db.SetPrimaryUserCharacter(ctx, database.SetPrimaryUserCharacterParams{
			UserID:        userID,
			CharacterGuid: charB,
			RealmID:       realm.ID,
		})
		require.NoError(t, err)

		rows, err := db.GetUserCharacterLinks(ctx, userID)
		require.NoError(t, err)
		require.Len(t, rows, 2)
		require.Equal(t, charB, rows[0].CharacterGuid)
		require.True(t, rows[0].IsPrimary)
	})
}
