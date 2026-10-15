package servicerankings_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func setupRankingsTest(t *testing.T) (*pgxpool.Pool, database.Store, uuid.UUID) {
	t.Helper()

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID := uuid.New()
	realmID := uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "test-server")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "test-realm")
	require.NoError(t, err)
	conn.Release()

	return pool, store, realmID
}

type rankingOpts struct {
	encounterName  string
	instanceName   string
	playerGUID     string
	playerClass    string
	playerSpec     string
	difficultyName string
	maxPlayers     int16
	damageDone     int64
	healingDone    int64
	durationSecs   float64
	dps            float64
	hps            float64
	killedAt       time.Time
	isBoss         bool
}

func insertRankingRow(t *testing.T, _ *pgxpool.Pool, store database.Store, realmID uuid.UUID, opts rankingOpts) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "u-" + userID.String()[:8],
	})
	require.NoError(t, err)

	logGroupID := uuid.New()
	now := time.Now()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: opts.instanceName, Capabilities: []string{},
	})
	require.NoError(t, err)

	var encounterID uuid.NullUUID
	if opts.isBoss {
		encID := uuid.New()
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID:         encID,
			InstanceID: instanceID,
			Name:       opts.encounterName,
			KillType:   database.KillTypeClean,
			Remaining:  guid.GUIDs{},
			Boss:       true,
			StartTime:  database.Timestamptz(opts.killedAt.Add(-time.Duration(opts.durationSecs) * time.Second)),
			EndTime:    database.Timestamptz(opts.killedAt),
		})
		require.NoError(t, err)
		encounterID = uuid.NullUUID{UUID: encID, Valid: true}
	}

	require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID:    encounterID,
		InstanceID:     instanceID,
		EncounterName:  opts.encounterName,
		InstanceName:   opts.instanceName,
		PlayerGuid:     opts.playerGUID,
		PlayerName:     "Player-" + opts.playerGUID,
		PlayerClass:    opts.playerClass,
		PlayerSpec:     opts.playerSpec,
		DifficultyName: opts.difficultyName,
		MaxPlayers:     opts.maxPlayers,
		RealmID:        realmID,
		RealmName:      "test-realm",
		DamageDone:     opts.damageDone,
		HealingDone:    opts.healingDone,
		DurationSecs:   opts.durationSecs,
		Dps:            opts.dps,
		Hps:            opts.hps,
		KilledAt:       database.Timestamptz(opts.killedAt),
		LogHashedSlug:  "slug-" + uuid.NewString()[:8],
	}))
}
