package chronicle

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/forever/events"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/stretchr/testify/require"
)

func TestScoutingCharacterNamePreservesGuild(t *testing.T) {
	t.Parallel()
	// Scouting Name contains character components, not the CLEU realm suffix.
	// Keep this synthetic: no uploaded personal artifact belongs in the repository.
	raw, err := json.Marshal(map[string]any{
		"schema_version": 1, "kind": "sidekick-events",
		"sources": []map[string]any{{"account": "test", "source": "test.lua", "collections_lua": `{
   scouting = { Version = 1, Players = {
    ["Player-1-00000001"] = {
     Name = "First-Last", LastSeen = 1700000200,
     At = {1700000000, 1700000100}, Levels = {20, "_"},
     Guilds = {"Example Guild", "_"}, Party = {false, "_"}
    }
   }}
  }`}},
	})
	require.NoError(t, err)
	artifact, err := events.Decode(t.Context(), bytes.NewReader(raw))
	require.NoError(t, err)
	sources, err := scouting.Decode(artifact)
	require.NoError(t, err)
	index, err := scouting.New(sources)
	require.NoError(t, err)
	const id guid.GUID = 1<<32 | 1
	require.Equal(t, "Example Guild", *index.KnownAt(id, 1700000200).Guild.Guild)
	db, _ := dbtestutil.NewDB(t)
	_, realmID := insertVisibilityTestOwnerAndRealm(t, t.Context(), db)
	realm, err := db.GetWoWServerRealm(t.Context(), realmID)
	require.NoError(t, err)
	// Use an explicit catalog realm and raw combat evidence. Missing Realm in the
	// artifact is not permission to fall back to an upload realm.
	realm.Name = "Normal-US"
	catalog := newParticipantRealmCatalog(realm.ServerID, []database.WowServerRealm{realm})
	combat := &combatIdentity{}
	combat.observe(id, "First Last", "Normal-US")
	filtered, realms, _ := reconcileForeverScouting(index, combat, catalog)
	require.Equal(t, realmID, realms[id])
	require.Equal(t, "First Last", filtered.KnownAt(id, 1700000200).Name.Name)
	require.Equal(t, "First-Last", index.KnownAt(id, 1700000200).Name.Name, "retained source is immutable")
	payload, err := scoutingPayload(filtered, realms, time.Unix(1700000200, 0))
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 1)
	require.True(t, rows[0].GuildKnown)
	require.Equal(t, "Example Guild", *rows[0].GuildName)
	require.Equal(t, int64(1700000100), rows[0].GuildObservedAt.Unix())
	_, err = db.UpsertScoutedPlayers(t.Context(), payload)
	require.NoError(t, err)
	player, err := db.GetGamePlayerByGUID(t.Context(), database.GetGamePlayerByGUIDParams{RealmID: realmID, Identifier: id})
	require.NoError(t, err)
	require.Equal(t, "First Last", player.Name)
	require.True(t, player.GuildID.Valid)
	require.Equal(t, "Example Guild", player.GuildName.String)
	for _, evidence := range []*combatIdentity{{}, {names: map[guid.GUID]map[string]struct{}{id: {"First Other": {}}}}} {
		rejected, rejectedRealms, _ := reconcileForeverScouting(index, evidence, catalog)
		require.Zero(t, rejected.Len())
		require.Empty(t, rejectedRealms, "missing realm or different combat name must still reject source")
	}
}
