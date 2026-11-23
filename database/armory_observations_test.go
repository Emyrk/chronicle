package database_test

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestPlayerObservationOrdering(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	server, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "scout"})
	require.NoError(t, err)
	realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "realm"})
	require.NoError(t, err)
	at := func(hour int) time.Time { return time.Date(2025, 1, 1, hour, 0, 0, 0, time.UTC) }
	ts := func(hour int) pgtype.Timestamptz { return pgtype.Timestamptz{Time: at(hour), Valid: true} }
	id := guid.GUID(123)
	scout := func(hour int, fields map[string]any) {
		t.Helper()
		fields["id"], fields["realm_id"], fields["observed_at"] = id.String(), realm.ID, at(hour)
		if _, ok := fields["name"]; !ok {
			fields["name"] = "Scout"
		}
		for _, field := range []string{"name", "class", "race", "gender", "faction", "level", "guild"} {
			key := field
			if field == "guild" {
				key = "guild_known"
			}
			if _, known := fields[key]; known {
				if _, explicit := fields[field+"_observed_at"]; !explicit {
					fields[field+"_observed_at"] = at(hour)
				}
			}
		}
		payload, err := json.Marshal([]map[string]any{fields})
		require.NoError(t, err)
		result, err := db.UpsertScoutedPlayers(ctx, payload)
		require.NoError(t, err)
		require.Len(t, result, 1)
		require.Equal(t, id, result[0].ID)
		if name, ok := fields["guild_name"].(string); ok && name != "" && fields["guild_known"] == true {
			require.True(t, result[0].ObservedGuildID.Valid)
		}
	}
	get := func() database.GetGamePlayerByGUIDRow {
		t.Helper()
		row, err := db.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realm.ID, Identifier: id})
		require.NoError(t, err)
		return row
	}
	legacy := func(hour int, change func(*database.UpsertPlayersParams)) {
		t.Helper()
		p := database.UpsertPlayersParams{ID: id, RealmID: realm.ID, Name: "", Class: database.WowPlayableClassUNKNOWN, Race: database.WowPlayableRaceUnknown, Gender: database.WowPlayableGenderUnknown, UpdatedAt: ts(hour)}
		change(&p)
		batch := db.UpsertPlayers(ctx, []database.UpsertPlayersParams{p})
		batch.Exec(func(_ int, err error) { require.NoError(t, err) })
		require.NoError(t, batch.Close())
	}
	scout(20, map[string]any{"level": 60, "guild_known": true, "guild_name": "Guild"})
	row := get()
	require.Equal(t, database.WowPlayableClassUNKNOWN, row.Class)
	require.False(t, row.ClassObservedAt.Valid)
	require.True(t, row.GuildID.Valid)
	require.Equal(t, pgtype.NegativeInfinity, row.UpdatedAt.InfinityModifier)
	// A newer scout must not suppress an older real gear snapshot or missing fields.
	legacy(19, func(p *database.UpsertPlayersParams) {
		p.Class = database.WowPlayableClassMAGE
		p.Level = 59
		p.Gear = &database.PlayerOutfit{}
		p.Gear[0].ItemID = 42
	})
	row = get()
	require.Equal(t, int16(60), row.Level)
	require.Equal(t, database.WowPlayableClassMAGE, row.Class)
	require.Equal(t, int32(42), row.Gear[0].ItemID)
	require.True(t, row.UpdatedAt.Time.Equal(at(19)))
	require.True(t, row.GuildID.Valid)
	// Older independently known race fills even after newer unknown snapshot.
	legacy(21, func(p *database.UpsertPlayersParams) {})
	legacy(18, func(p *database.UpsertPlayersParams) { p.Race = database.WowPlayableRaceHuman })
	row = get()
	require.Equal(t, database.WowPlayableRaceHuman, row.Race)
	require.True(t, row.UpdatedAt.Time.Equal(at(21)))
	scout(22, map[string]any{"guild_known": false, "guild_name": nil})
	require.True(t, get().GuildID.Valid)
	scout(23, map[string]any{"guild_known": true, "guild_name": ""})
	require.False(t, get().GuildID.Valid)
	scout(22, map[string]any{"guild_known": true, "guild_name": "Old"})
	require.False(t, get().GuildID.Valid)
	scout(24, map[string]any{"guild_known": true, "guild_name": nil})
	require.False(t, get().GuildID.Valid)
	require.True(t, get().GuildObservedAt.Time.Equal(at(24)))
	// Explicit guildless also works through legacy inputs, including NULL ID.
	legacy(24, func(p *database.UpsertPlayersParams) { p.GuildKnown = true })
	require.True(t, get().GuildObservedAt.Time.Equal(at(24)))
	// Aggregate clocks preserve the original known observation, not latest seen.
	scout(25, map[string]any{"level": 61, "level_observed_at": at(19), "scouting_last_seen_at": at(26)})
	row = get()
	require.Equal(t, int16(60), row.Level)
	require.True(t, row.ScoutingLastSeenAt.Time.Equal(at(26)))
	legacy(27, func(p *database.UpsertPlayersParams) {
		p.Class = database.WowPlayableClassWARRIOR
		p.ClassObservedAt = ts(18)
	})
	require.Equal(t, database.WowPlayableClassMAGE, get().Class)
	scout(28, map[string]any{"name": "IdentityOnly", "name_observed_at": nil})
	require.Equal(t, "Scout", get().Name)
	// The tracker sentinel is absent metadata, even with an explicit clock.
	beforeUnknownName := get().NameObservedAt
	legacy(29, func(p *database.UpsertPlayersParams) { p.Name = "Unknown" })
	require.Equal(t, "Scout", get().Name)
	require.Equal(t, beforeUnknownName, get().NameObservedAt)
	scout(30, map[string]any{"name": "Unknown"})
	require.Equal(t, "Scout", get().Name)
	require.Equal(t, beforeUnknownName, get().NameObservedAt)
	// Equal-time retry cannot change the observed value.
	scout(20, map[string]any{"level": 62})
	require.Equal(t, int16(60), get().Level)
	// Concurrent independent field updates must compose under row conflict locking.
	errors := make(chan error, 2)
	for _, fields := range []map[string]any{
		{"id": id.String(), "realm_id": realm.ID, "name": "Scout", "observed_at": at(30), "gender": "Female", "gender_observed_at": at(30)},
		{"id": id.String(), "realm_id": realm.ID, "name": "Scout", "observed_at": at(29), "faction": "Alliance", "faction_observed_at": at(29)},
	} {
		payload, err := json.Marshal([]map[string]any{fields})
		require.NoError(t, err)
		go func() { _, err := db.UpsertScoutedPlayers(ctx, payload); errors <- err }()
	}
	// Join both operations before assertions/cleanup so failures cannot leak work.
	first, second := <-errors, <-errors
	require.NoError(t, first)
	require.NoError(t, second)
	row = get()
	require.Equal(t, database.WowPlayableGenderFemale, row.Gender)
	require.Equal(t, database.WowPlayerFactionAlliance, row.Faction.WowPlayerFaction)
	require.True(t, row.GenderObservedAt.Time.Equal(at(30)))
	require.True(t, row.FactionObservedAt.Time.Equal(at(29)))
}

func TestScoutedPlayersThousandBatch(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	server, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "batch"})
	require.NoError(t, err)
	realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "realm"})
	require.NoError(t, err)
	rows := make([]map[string]any, 1000)
	for i := range rows {
		rows[i] = map[string]any{"id": guid.GUID(i + 1).String(), "realm_id": realm.ID, "name": fmt.Sprintf("Scout%d", i), "observed_at": time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC), "guild_known": true, "guild_name": "Shared", "guild_observed_at": time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)}
	}
	payload, err := json.Marshal(rows)
	require.NoError(t, err)
	result, err := db.UpsertScoutedPlayers(ctx, payload)
	require.NoError(t, err)
	require.Len(t, result, 1000)
	_, err = db.UpsertScoutedPlayers(ctx, payload)
	require.NoError(t, err)
	unknownPayload, err := json.Marshal([]map[string]any{{
		"id": guid.GUID(1001).String(), "realm_id": realm.ID, "name": "Unknown",
		"observed_at":      time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		"name_observed_at": time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}})
	require.NoError(t, err)
	_, err = db.UpsertScoutedPlayers(ctx, unknownPayload)
	require.NoError(t, err)
	unknown, err := db.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realm.ID, Identifier: guid.GUID(1001)})
	require.NoError(t, err)
	require.False(t, unknown.NameObservedAt.Valid)
	var guildID uuid.UUID
	for i := range rows {
		row, err := db.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realm.ID, Identifier: guid.GUID(i + 1)})
		require.NoError(t, err)
		require.Equal(t, fmt.Sprintf("Scout%d", i), row.Name)
		require.False(t, row.NameObservedAt.Valid)
		require.True(t, row.GuildID.Valid)
		if i == 0 {
			guildID = row.GuildID.UUID
		}
		require.Equal(t, guildID, row.GuildID.UUID)
	}
}
