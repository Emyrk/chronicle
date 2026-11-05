package chronicle

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestParsedAddonFormatGuards(t *testing.T) {
	t.Parallel()
	for _, format := range []database.LogFormat{database.LogFormat112aCcAddon, database.LogFormat243CcAddon, database.LogFormat335aCcAddon} {
		require.True(t, supportedParsedAddonFormat(format))
	}
	require.False(t, supportedParsedAddonFormat(database.LogFormat("unknown")))
	result := parseresult.Result{SchemaVersion: 7, Format: database.LogFormat("unknown")}
	_, err := InsertParsedCore(t.Context(), nil, result, ParsedCoreWrite{})
	require.ErrorContains(t, err, "unsupported core parse result")
	require.ErrorContains(t, InsertParsedSpeedrun(t.Context(), nil, result, ParsedSpeedrunWrite{}), "unsupported speedrun parse result")
	// Ranking guards remain deliberately narrower until flavor-specific rules
	// and game-data parity have been established for CLEU formats.
	result.Format = database.LogFormat243CcAddon
	require.ErrorContains(t, InsertParsedBossRankings(t.Context(), nil, result, ParsedBossRankingWrite{}), "unsupported boss ranking parse result")
	require.ErrorContains(t, InsertParsedTrashRankings(t.Context(), nil, result, ParsedBossRankingWrite{}), "unsupported trash ranking parse result")
}

// Compare only the core instance/overview and damage event rows. The direct
// sqlc writes below mirror the legacy writer's insert arguments; this is not
// full legacy-worker parity for TBC/Wrath (guilds and rankings are omitted).
func TestParsedCLEUCoreAndEventsMatchDirectRows(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		format database.LogFormat
		flavor database.WoWFlavor
		suffix string
	}{
		{"tbc", database.LogFormat243CcAddon, database.WoWFlavor{database.FlavorTBC}, "250,1,5,0,10,1,nil,nil"},
		{"wrath", database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath}, "250,0,1,0,0,0,nil,nil,nil"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			reg := registry.RegistryForFlavor(logger, tc.flavor)
			parseCtx := parsectx.With(ctx, parsectx.Context{Format: tc.format, Flavor: tc.flavor})
			log := strings.Join([]string{
				`8/8 18:43:42.478  SWING_DAMAGE,0x0000000000000001,"Raider",0x511,0xF1300043490001E0,"Nightbane",0x10a48,` + tc.suffix,
				`8/8 18:43:44.478  SWING_DAMAGE,0x0000000000000001,"Raider",0x511,0xF1300043490001E0,"Nightbane",0x10a48,` + tc.suffix,
			}, "\n")
			results, err := parseresult.Parse(parseCtx, strings.NewReader(log), parityGameDB{}, reg, logger)
			require.NoError(t, err)
			require.Len(t, results, 1)
			require.NotEmpty(t, results[0].Events.Damage)
			payload, err := json.Marshal(results[0])
			require.NoError(t, err)
			var decoded parseresult.Result
			require.NoError(t, json.Unmarshal(payload, &decoded))
			store, _ := dbtestutil.NewDB(t)
			owner, server, realm, group := uuid.New(), uuid.New(), uuid.New(), uuid.New()
			at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
			_, err = store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "cleu-core-" + owner.String()})
			require.NoError(t, err)
			_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "cleu-core-" + server.String()})
			require.NoError(t, err)
			_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "CLEU Realm"})
			require.NoError(t, err)
			_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2, CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
			require.NoError(t, err)
			require.NoError(t, store.InsertParsedLogGroup(ctx, group))
			directID, parsedID := uuid.New(), uuid.New()
			category := pgtype.Text{}
			if decoded.Core.Category != "" {
				category = pgtype.Text{String: decoded.Core.Category, Valid: true}
			}
			direct, err := store.InsertInstance(ctx, database.InsertInstanceParams{
				ID: directID, RealmID: realm, LogGroupID: group, Name: decoded.Name,
				HashedSlug: pgtype.Text{String: database.InstanceSlug(group, decoded.Name), Valid: true},
				StartTime:  database.Timestamptz(decoded.Core.Start), EndTime: database.Timestamptz(decoded.Core.End),
				Capabilities: decoded.Core.Capabilities, Versions: database.VersionsMap(decoded.Versions),
				RecorderName: decoded.RecorderName, RecorderGuid: decoded.RecorderGUID, ParserVersion: "test",
				DifficultyName: decoded.Core.DifficultyName, MaxPlayers: decoded.Core.MaxPlayers,
				DynamicDifficulty: decoded.Core.DynamicDifficulty, Category: category,
				VehicleControlIntervals: decoded.Core.VehicleMetadata,
			})
			require.NoError(t, err)
			// Direct legacy-style overview and stream writes for equivalent inputs.
			complete := pgtype.Bool{}
			if decoded.Overview.RequirementsComplete != nil {
				complete = pgtype.Bool{Bool: *decoded.Overview.RequirementsComplete, Valid: true}
			}
			abilities := make([]database.OverviewIncomingDamageAbility, 0, len(decoded.Overview.TopIncomingDamageAbilities))
			for _, a := range decoded.Overview.TopIncomingDamageAbilities {
				abilities = append(abilities, database.OverviewIncomingDamageAbility{SpellID: a.SpellID, Name: a.Name, Damage: a.Damage, Hits: a.Hits, EnvironmentType: a.EnvironmentType})
			}
			require.NoError(t, store.UpsertInstanceOverviewMetrics(ctx, database.UpsertInstanceOverviewMetricsParams{
				InstanceID: directID, RequirementsComplete: complete, PlayerDeaths: decoded.Overview.PlayerDeaths, WipeCount: decoded.Overview.WipeCount,
				TopIncomingDamageAbilities: abilities, EncounterSpanDurationMs: decoded.Overview.EncounterSpanDurationMs,
				TotalCombatDurationMs: decoded.Overview.TotalCombatDurationMs, TotalBossDurationMs: decoded.Overview.TotalBossDurationMs,
				MetricsVersion: decoded.Overview.MetricsVersion,
			}))
			events := encounterevents.Events(results[0].Events)
			require.NoError(t, events.Insert(ctx, store, directID))
			adapted, err := InsertParsedCore(ctx, store, decoded, ParsedCoreWrite{InstanceID: parsedID, RealmID: realm, LogGroupID: group, ParserVersion: "test"})
			require.NoError(t, err)
			require.NoError(t, InsertParsedEventStreams(ctx, store, parsedID, decoded.Events))
			direct.ID, adapted.ID = uuid.Nil, uuid.Nil
			direct.HashedSlug, adapted.HashedSlug = pgtype.Text{}, pgtype.Text{}
			direct.UpdatedAt, adapted.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
			if diff := cmp.Diff(direct, adapted); diff != "" {
				t.Fatalf("core instance rows (-direct +adapter):\n%s", diff)
			}
			oldOverview, err := store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: directID, MetricsVersion: decoded.Overview.MetricsVersion})
			require.NoError(t, err)
			newOverview, err := store.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{InstanceID: parsedID, MetricsVersion: decoded.Overview.MetricsVersion})
			require.NoError(t, err)
			oldOverview.InstanceID, newOverview.InstanceID = uuid.Nil, uuid.Nil
			oldOverview.CreatedAt, newOverview.CreatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
			oldOverview.UpdatedAt, newOverview.UpdatedAt = pgtype.Timestamptz{}, pgtype.Timestamptz{}
			if diff := cmp.Diff(oldOverview, newOverview); diff != "" {
				t.Fatalf("overview rows (-direct +adapter):\n%s", diff)
			}
			oldEvents, err := store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: directID, Type: string(database.LogInstanceEventTypeDamage)})
			require.NoError(t, err)
			newEvents, err := store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: parsedID, Type: string(database.LogInstanceEventTypeDamage)})
			require.NoError(t, err)
			if diff := cmp.Diff(unzipEventRow(t, oldEvents.Events), unzipEventRow(t, newEvents.Events)); diff != "" {
				t.Fatalf("damage rows (-direct +adapter):\n%s", diff)
			}
			if !bytes.Equal(decoded.Events.Damage, results[0].Events.Damage) {
				t.Fatal("adapter mutated event source")
			}
		})
	}
}
