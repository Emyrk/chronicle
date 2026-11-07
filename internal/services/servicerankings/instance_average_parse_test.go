package servicerankings_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestInstanceAverageParse(t *testing.T) {
	t.Parallel()

	// Two bosses. "dps" does damage on both (DPS 90, 70 → 80). "hybrid" heals
	// Golemagg and does damage on Ragnaros; Golemagg's row comes first, so the
	// endpoint calls them a healer and reads HPS (60, 60 → 60), not DPS (20).
	// Counted once each: (80 + 60) / 2 = 70.
	setup := func(t *testing.T) parsesTestFixture {
		f := setupParsesTest(t)
		ranking := func(encounter, playerGUID, role string, dps, hps float64) {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName: encounter, playerGUID: playerGUID, playerName: playerGUID,
				playerClass: "DRUID", playerSpec: "Balance", dps: dps, hps: hps,
				difficultyName: "Normal", maxPlayers: 40, killedAt: time.Now(),
			})
			ctx := testutil.Context(t, testutil.WaitShort)
			_, err := f.pool.Exec(ctx,
				"UPDATE encounter_dps_rankings SET player_role = $1 WHERE instance_id = $2 AND player_guid = $3 AND encounter_name = $4",
				role, f.instanceID, playerGUID, encounter)
			require.NoError(t, err)
		}
		ranking("Golemagg", "dps", "dps", 1000, 0)
		ranking("Ragnaros", "dps", "dps", 1000, 0)
		ranking("Golemagg", "hybrid", "heal", 100, 900)
		ranking("Ragnaros", "hybrid", "dps", 100, 900)

		snapshot := f.publishSnapshot(t)
		snapshotID := uuid.NullUUID{UUID: snapshot.ID, Valid: true}
		result := func(encounter, playerGUID, metric string, score int16) {
			f.insertPersistedParseResult(t, struct {
				tenantID      uuid.UUID
				snapshotID    uuid.NullUUID
				encounterName string
				playerGUID    string
				playerName    string
				metric        string
				metricValue   float64
				preciseScore  float64
				displayScore  int16
				rank          int32
				sampleSize    int32
				status        string
			}{
				snapshotID: snapshotID, encounterName: encounter, playerGUID: playerGUID, playerName: playerGUID,
				metric: metric, metricValue: 1000, preciseScore: float64(score), displayScore: score,
				rank: 1, sampleSize: 25, status: string(parsepolicy.StatusOK),
			})
		}
		result("Golemagg", "dps", "dps", 90)
		result("Ragnaros", "dps", "dps", 70)
		result("Golemagg", "hybrid", "dps", 20)
		result("Ragnaros", "hybrid", "dps", 20)
		result("Golemagg", "hybrid", "hps", 60)
		result("Ragnaros", "hybrid", "hps", 60)
		f.insertPersistedParseReceipt(t, uuid.Nil, snapshot.ID, 6)
		return f
	}

	t.Run("OnePerPlayerByRole", func(t *testing.T) {
		t.Parallel()
		f := setup(t)
		ctx := testutil.Context(t, testutil.WaitShort)
		avg, ok, err := servicerankings.InstanceAverageParse(ctx, f.store, f.instanceID)
		require.NoError(t, err)
		require.True(t, ok)
		require.Equal(t, 70, avg)
	})

	t.Run("InvalidInstance", func(t *testing.T) {
		t.Parallel()
		f := setup(t)
		ctx := testutil.Context(t, testutil.WaitShort)
		require.NoError(t, f.store.InvalidateWoWLogGroup(ctx, database.InvalidateWoWLogGroupParams{
			LogGroupID: f.logGroupID, Reason: "corrupt combat log",
		}))
		_, ok, err := servicerankings.InstanceAverageParse(ctx, f.store, f.instanceID)
		require.NoError(t, err)
		require.False(t, ok)
	})

	t.Run("DisabledTenant", func(t *testing.T) {
		t.Parallel()
		f := setup(t)
		ctx := testutil.Context(t, testutil.WaitShort)
		tenant, err := f.store.InsertTenant(ctx, database.InsertTenantParams{
			ID: uuid.New(), Name: "disabled-tenant", ParseConfig: []byte(`{"cohort_mode":"disabled"}`),
			IncludeInAll: true, AvailableFormats: []string{},
		})
		require.NoError(t, err)
		_, ok, err := servicerankings.InstanceAverageParse(servicetenant.WithTenantID(ctx, tenant.ID), f.store, f.instanceID)
		require.NoError(t, err)
		require.False(t, ok)
	})

	t.Run("NoPersistedResults", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "dps", 1000, 0)
		ctx := testutil.Context(t, testutil.WaitShort)
		_, ok, err := servicerankings.InstanceAverageParse(ctx, f.store, f.instanceID)
		require.NoError(t, err)
		require.False(t, ok, "never scores on demand")
	})
}
