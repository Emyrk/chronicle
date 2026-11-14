package chronicle

import (
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParsedLootRowsMatchLegacyAfterJSONRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	owner, server, realm, group := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "loot-parity-" + owner.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "loot-parity-" + server.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "Loot Test Realm"})
	require.NoError(t, err)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2,
		CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, group))
	ids := [2]uuid.UUID{uuid.New(), uuid.New()}
	for _, id := range ids {
		_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: id, RealmID: realm, LogGroupID: group, Name: "Loot Test",
			StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)),
			Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
	}
	tracker := loot.New(unitdb.New())
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, &messages.Loot{
		MessageBase: messages.Base(at), PlayerName: "First", ItemName: "Test item",
		ItemID: 123, ItemSuffixID: 4, Quantity: 2,
	}))
	require.NoError(t, tracker.Finalize(ctx))
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	zed := authz.NewDatabaseOnly(logger, store)
	require.NoError(t, zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		return tracker.Insert(ctx, ids[0], realm, tx)
	}, nil))

	observations := make([]parseresult.LootObservation, 0)
	for _, drop := range tracker.Snapshot() {
		observations = append(observations, parseresult.LootObservation{
			SourceGUID: drop.Source.String(), SourceTS: drop.SourceTS,
			ReceivedGUID: drop.Received.String(), ReceivedTS: drop.ReceivedTS,
			ItemID: drop.ItemID, ItemName: drop.ItemName,
			LootSuffix: drop.LootSuffix, Quantity: drop.Quantity,
		})
	}
	encoded, err := json.Marshal(observations)
	require.NoError(t, err)
	var decoded []parseresult.LootObservation
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	require.NoError(t, InsertParsedLoot(ctx, store, ids[1], realm, decoded))

	legacy, err := store.GetInstanceLoot(ctx, database.GetInstanceLootParams{InstanceID: ids[0]})
	require.NoError(t, err)
	fresh, err := store.GetInstanceLoot(ctx, database.GetInstanceLootParams{InstanceID: ids[1]})
	require.NoError(t, err)
	require.Len(t, legacy, 1)
	require.Len(t, fresh, 1)
	legacy[0].ID, fresh[0].ID = uuid.Nil, uuid.Nil
	legacy[0].InstanceID, fresh[0].InstanceID = uuid.Nil, uuid.Nil
	if diff := cmp.Diff(legacy, fresh); diff != "" {
		t.Fatalf("loot rows differ (-legacy +new):\n%s", diff)
	}
}
