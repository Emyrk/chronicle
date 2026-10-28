package api

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestParseArmoryPlayerGUID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		identifier string
		expected   guid.GUID
	}{
		{
			name:       "canonical GUID",
			identifier: "0x000000000008C9B8",
			expected:   guid.GUID(0x000000000008C9B8),
		},
		{
			name:       "decimal uint32 game ID",
			identifier: "575928",
			expected:   guid.GUID(0x000000000008C9B8),
		},
		{
			name:       "player name",
			identifier: "Axm",
		},
		{
			name:       "decimal overflow",
			identifier: "4294967296",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.expected, parseArmoryPlayerGUID(tt.identifier))
		})
	}
}

func TestCharacterOwnerAdsFree(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	store := servicedbstore.DatabaseStore(broker)

	serverID := uuid.New()
	realmID := uuid.New()
	_, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID: serverID, Name: "server-" + serverID.String()[:8],
	})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID: realmID, ServerID: serverID, Name: "realm-" + realmID.String()[:8],
	})
	require.NoError(t, err)

	characterGUID := guid.GUID(0x1234)
	players := store.UpsertPlayers(ctx, []database.UpsertPlayersParams{{
		ID:        characterGUID,
		RealmID:   realmID,
		Name:      "Armoryowner",
		Class:     database.WowPlayableClassWARRIOR,
		Gender:    database.WowPlayableGenderMale,
		Race:      database.WowPlayableRaceHuman,
		Level:     60,
		UpdatedAt: database.Timestamptz(time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)),
	}})
	require.NoError(t, players.Close())

	handlerAPI := &API{Opts: &Options{Zed: zed}}
	adsFree, err := handlerAPI.characterOwnerAdsFree(ctx, characterGUID, realmID)
	require.NoError(t, err)
	require.False(t, adsFree)

	ownerID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "owner-" + ownerID.String()[:8],
	})
	require.NoError(t, err)
	_, err = store.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{
		UserID:        ownerID,
		CharacterGuid: characterGUID,
		RealmID:       realmID,
	})
	require.NoError(t, err)

	adsFree, err = handlerAPI.characterOwnerAdsFree(ctx, characterGUID, realmID)
	require.NoError(t, err)
	require.False(t, adsFree)

	require.NoError(t, zed.SetUserChronicleRoles(ctx, ownerID, []string{"ad_free_capable"}))
	adsFree, err = handlerAPI.characterOwnerAdsFree(ctx, characterGUID, realmID)
	require.NoError(t, err)
	require.False(t, adsFree, "personal ad-free access must not make linked character pages ad-free")

	require.NoError(t, zed.SetUserChronicleRoles(ctx, ownerID, []string{"revered"}))
	adsFree, err = handlerAPI.characterOwnerAdsFree(ctx, characterGUID, realmID)
	require.NoError(t, err)
	require.True(t, adsFree)
}
