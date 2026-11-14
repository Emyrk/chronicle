package chronicle

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestParsedBossRankingDirectWriterParity(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	owner, server, realm, group := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "boss-rank-" + owner.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "boss-rank-" + server.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "Boss Realm"})
	require.NoError(t, err)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2, CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, group))
	ids := [2]uuid.UUID{uuid.New(), uuid.New()}
	var instancesDB [2]database.LogInstance
	for i, id := range ids {
		instancesDB[i], err = store.InsertInstance(ctx, database.InsertInstanceParams{ID: id, RealmID: realm, LogGroupID: group, Name: "Boss Raid", StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)), Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40})
		require.NoError(t, err)
	}
	encID, player, pet := uuid.New(), guid.GUID(42), guid.GUID(7)
	guilds := armory.New(unitdb.New())
	guilds.Players[player] = combatant.Combatant{Guid: player, Name: "Alice"}
	guilds.Guilds["Team"] = map[guid.GUID]struct{}{player: {}}
	fin := &instances.FinalizedInstance{Guilds: guilds, RankingRules: &rankings.Rankings{}, Rankings: &rankings.RankingsResult{
		DPS: map[uuid.UUID]*rankings.DPSResult{encID: {Units: map[guid.GUID]*rankings.UnitCombatStats{
			player: {IsPlayer: true, RankedDamageDone: 80, UnrankedDamageDone: 20, HealingDone: 10, HealingAbsorbed: 5},
			pet:    {OwnerGUID: &player, RankedDamageDone: 20, UnrankedDamageDone: 3, HealingDone: 4, HealingAbsorbed: 2},
		}}}, Survivability: map[uuid.UUID]*rankings.SurvivabilityResult{encID: {Players: map[guid.GUID]rankings.PlayerSurvivability{player: {Deaths: 1, AlivePercentage: 70}}}},
	}, Encounters: []encounter.Encounter{{Boss: true, KillType: encounter.KillTypeClean, Name: "Boss", Combat: encounter.Fight{EncounterID: encID, Start: at, End: at.Add(10 * time.Second)}}}}
	otherEncounterID := uuid.New()
	for i, id := range ids {
		current := encID
		if i == 1 {
			current = otherEncounterID
		}
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: current, InstanceID: id, Name: "Boss", MapID: 1, KillType: database.KillType("clean"),
			Remaining: []guid.GUID{}, Boss: true, StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(10 * time.Second)),
		})
		require.NoError(t, err)
	}
	projection, err := parseresult.Build(parseresult.Input{Format: database.LogFormat112aCcAddon, Name: "Boss Raid", Finalized: fin, Events: encounterevents.NewEvents()})
	require.NoError(t, err)
	encoded, err := json.Marshal(projection)
	require.NoError(t, err)
	var result parseresult.Result
	require.NoError(t, json.Unmarshal(encoded, &result))
	require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID: uuid.NullUUID{UUID: encID, Valid: true}, InstanceID: ids[0], EncounterName: "Boss", InstanceName: "Boss Raid",
		PlayerGuid: player.String(), PlayerName: "Alice", PlayerClass: "UNKNOWN", PlayerSpec: "Unknown", PlayerRole: "dps", GuildName: "Team",
		DifficultyName: "Normal", MaxPlayers: 40, RealmID: realm, RealmName: "Boss Realm",
		DamageDone: 100, UnrankedDamageDone: 23, DurationSecs: 10, Dps: 10, HealingDone: 14, AbsorbedDone: 7, Hps: 2.1,
		AlivePercentage: pgtype.Float8{Float64: 70, Valid: true}, PlayerDeaths: pgtype.Int4{Int32: 1, Valid: true}, KilledAt: database.Timestamptz(at.Add(10 * time.Second)),
	}))
	result.BossRankings.Encounters[0].ID = otherEncounterID.String()
	write := ParsedBossRankingWrite{Instance: instancesDB[1], RealmName: "Boss Realm", Rankable: true}
	require.NoError(t, InsertParsedBossRankings(ctx, store, result, write))
	direct, err := store.InstanceRankingRecords(ctx, ids[0])
	require.NoError(t, err)
	projected, err := store.InstanceRankingRecords(ctx, ids[1])
	require.NoError(t, err)
	require.Len(t, direct, 1)
	require.Len(t, projected, 1)
	direct[0].ID, projected[0].ID = uuid.Nil, uuid.Nil
	direct[0].EncounterID, projected[0].EncounterID = uuid.NullUUID{}, uuid.NullUUID{}
	direct[0].InstanceID, projected[0].InstanceID = uuid.Nil, uuid.Nil
	direct[0].CreatedAt, projected[0].CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
	if diff := cmp.Diff(direct, projected); diff != "" {
		t.Fatalf("boss ranking rows differ (-direct +adapter):\n%s", diff)
	}
	// Rankability and level violations are write gates, not changes to the DTO rows.
	for _, mutate := range []func(*parseresult.Result, *ParsedBossRankingWrite){
		func(_ *parseresult.Result, w *ParsedBossRankingWrite) { w.Rankable = false },
		func(r *parseresult.Result, _ *ParsedBossRankingWrite) { r.BossRankings.LevelEligible = false },
	} {
		r := result
		w := write
		w.Instance = instancesDB[0]
		mutate(&r, &w)
		// Guard against an attempted write by passing a nil store.
		require.NoError(t, InsertParsedBossRankings(ctx, nil, r, w))
	}
}
