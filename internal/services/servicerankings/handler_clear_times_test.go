package servicerankings_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClearTimes_BoxStatsFromQualifiedClears(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupTimeParseTest(t)
	svc := servicerankings.NewTestableService(store, nil)
	start := time.Now().Add(-48 * time.Hour)
	clear := func(durationMs int64, qualified bool, group uuid.NullUUID) {
		insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
			instanceName: "Molten Core", qualified: qualified, durationMs: durationMs,
			startTime: start, duplicateGroupID: group,
		})
	}
	for _, minutes := range []int64{60, 70, 80, 90, 100} {
		clear(minutes*60_000, true, uuid.NullUUID{})
	}
	clear(10*60_000, false, uuid.NullUUID{}) // not qualified
	// A duplicate upload of one run keeps only its fastest copy.
	group := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	clear(120*60_000, true, group)
	clear(130*60_000, true, group)

	stats := callTimeParseJSON[[]chroniclesdk.RankingsKillTimeStats](t, svc.HandleClearTimes, "/clear-times?instance_name=Molten+Core")
	require.Len(t, stats, 1)
	assert.Equal(t, "Full clear", stats[0].EncounterName)
	assert.Equal(t, int64(6), stats[0].Count)
	assert.Equal(t, 3600.0, stats[0].MinSecs)
	assert.Equal(t, 7200.0, stats[0].MaxSecs)
	assert.Equal(t, 5100.0, stats[0].MedianSecs)

	empty := callTimeParseJSON[[]chroniclesdk.RankingsKillTimeStats](t, svc.HandleClearTimes, "/clear-times?instance_name=Onyxia%27s+Lair")
	assert.Empty(t, empty)
}
