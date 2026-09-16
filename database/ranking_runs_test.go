package database_test

import (
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertRankingRunSource(t *testing.T, pool *pgxpool.Pool, store database.Store, realmID, instanceID uuid.UUID, start time.Time, bosses ...string) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "u-" + userID.String()[:8]})
	require.NoError(t, err)
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(start), UpdatedAt: database.Timestamptz(start),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40,
		StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(time.Hour)),
		Capabilities: []string{},
	})
	require.NoError(t, err)

	for i, boss := range bosses {
		killedAt := start.Add(time.Duration(i+1) * time.Minute)
		encounterID := uuid.New()
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encounterID, InstanceID: instanceID, Name: boss, Boss: true,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{},
			StartTime: database.Timestamptz(killedAt.Add(-10 * time.Second)),
			EndTime:   database.Timestamptz(killedAt),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true}, InstanceID: instanceID,
			EncounterName: boss, InstanceName: "Molten Core", PlayerGuid: "P-" + instanceID.String(),
			PlayerName: "Player", PlayerClass: "MAGE", DifficultyName: "Normal", MaxPlayers: 40,
			RealmID: realmID, RealmName: "test-realm", DamageDone: 1000, DurationSecs: 10, Dps: 100,
			KilledAt: database.Timestamptz(killedAt), LogHashedSlug: instanceID.String(),
		}))
	}

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
}

func upsertRankingRunSource(t *testing.T, store database.Store, source database.RankingRunSourcesRow) bool {
	t.Helper()
	created, err := store.UpsertRankingRun(testutil.Context(t, testutil.WaitShort), database.UpsertRankingRunParams(source))
	require.NoError(t, err)
	return created
}

func TestRankingRunRepresentativePrefersBroaderDuplicate(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	duplicateID := uuid.New()
	start := time.Date(2026, 9, 1, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron", "Magmadar")
	insertRankingRunSource(t, pool, store, realmID, duplicateID, start.Add(time.Second), "Lucifron", "Magmadar", "Ragnaros")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, duplicateID},
	}))

	sources, err := store.RankingRunSources(ctx, []uuid.UUID{duplicateID, anchorID, duplicateID})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	assert.Equal(t, anchorID, sources[0].RunID)
	assert.Equal(t, duplicateID, sources[0].RepresentativeInstanceID)
	assert.Equal(t, int32(3), sources[0].BossCoverage)
	assert.Equal(t, int32(2), sources[0].MemberCount)
	assert.True(t, upsertRankingRunSource(t, store, sources[0]))

	_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
	assert.True(t, errors.Is(err, pgx.ErrNoRows), "unchanged upsert should return no row: %v", err)
	run, err := store.RankingRunByID(ctx, anchorID)
	require.NoError(t, err)
	assert.Equal(t, duplicateID, run.RepresentativeInstanceID)
}

func TestRankingRunRepresentativeTieBreakers(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	duplicateID := uuid.New()
	start := time.Date(2026, 9, 2, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start.Add(time.Minute), "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, duplicateID, start, "Lucifron")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, duplicateID},
	}))
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{anchorID})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	assert.Equal(t, anchorID, sources[0].RepresentativeInstanceID, "anchor wins an equal-coverage tie before start time")
}

func TestRankingRunRefreshConvergesAfterReorderUnlinkAndDelete(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	duplicateID := uuid.New()
	start := time.Date(2026, 9, 3, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, duplicateID, start.Add(time.Second), "Lucifron", "Ragnaros")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, duplicateID},
	}))

	created, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{duplicateID, anchorID, duplicateID})
	require.NoError(t, err)
	assert.Equal(t, int64(1), created.CreatedCount)
	repeated, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{anchorID, duplicateID})
	require.NoError(t, err)
	assert.Equal(t, int64(1), repeated.UnchangedCount)

	require.NoError(t, store.ClearDuplicateGroupID(ctx, duplicateID))
	unlinked, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{duplicateID, anchorID})
	require.NoError(t, err)
	assert.Equal(t, 2, unlinked.ResolvedRunCount)
	standalone, err := store.RankingRunByID(ctx, duplicateID)
	require.NoError(t, err)
	assert.Equal(t, duplicateID, standalone.RepresentativeInstanceID)
	group, err := store.RankingRunByID(ctx, anchorID)
	require.NoError(t, err)
	assert.Equal(t, anchorID, group.RepresentativeInstanceID)

	identities, err := store.RankingRunIdentitiesByInstanceIDs(ctx, []uuid.UUID{duplicateID})
	require.NoError(t, err)
	require.Len(t, identities, 1)
	_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{duplicateID})
	require.NoError(t, err)
	deleted, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{identities[0].InstanceID, identities[0].RunID})
	require.NoError(t, err)
	assert.Zero(t, deleted.DeletedCount, "the representative FK cascade removes the standalone row before refresh")
	_, err = store.RankingRunByID(ctx, duplicateID)
	assert.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestRankingRunRefreshMergesGroupsAndReplacesDeletedRepresentative(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	representativeID := uuid.New()
	otherGroupID := uuid.New()
	start := time.Date(2026, 9, 4, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, representativeID, start.Add(time.Second), "Lucifron", "Magmadar", "Ragnaros")
	insertRankingRunSource(t, pool, store, realmID, otherGroupID, start.Add(2*time.Second), "Lucifron", "Magmadar")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, representativeID},
	}))
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: otherGroupID, Valid: true}, Ids: []uuid.UUID{otherGroupID},
	}))
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{anchorID, otherGroupID})
	require.NoError(t, err)

	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, otherGroupID},
	}))
	merged, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{otherGroupID, anchorID})
	require.NoError(t, err)
	assert.Equal(t, int64(1), merged.DeletedCount)
	_, err = store.RankingRunByID(ctx, otherGroupID)
	assert.ErrorIs(t, err, pgx.ErrNoRows)

	_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{representativeID})
	require.NoError(t, err)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{representativeID, anchorID})
	require.NoError(t, err)
	run, err := store.RankingRunByID(ctx, anchorID)
	require.NoError(t, err)
	assert.Equal(t, otherGroupID, run.RepresentativeInstanceID)
	assert.Equal(t, int32(2), run.BossCoverage)
}

func TestRankingRunRepairSignalAfterDeletion(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name             string
		anchorUpdatedAt  time.Time
		deletedUpdatedAt time.Time
	}{
		{
			name:             "non-representative member",
			anchorUpdatedAt:  time.Date(2026, 9, 16, 10, 1, 0, 0, time.UTC),
			deletedUpdatedAt: time.Date(2026, 9, 16, 10, 0, 0, 0, time.UTC),
		},
		{
			name:             "newest-timestamp member",
			anchorUpdatedAt:  time.Date(2026, 9, 16, 10, 0, 0, 0, time.UTC),
			deletedUpdatedAt: time.Date(2026, 9, 16, 10, 1, 0, 0, time.UTC),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool, store, realmID := setupParsesTest(t)
			ctx := testutil.Context(t, testutil.WaitMedium)
			anchorID := uuid.New()
			deletedID := uuid.New()
			start := time.Date(2026, 9, 16, 9, 0, 0, 0, time.UTC)
			insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron", "Magmadar")
			insertRankingRunSource(t, pool, store, realmID, deletedID, start.Add(time.Second), "Lucifron")
			require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
				DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, deletedID},
			}))

			conn, err := pool.Acquire(ctx)
			require.NoError(t, err)
			_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
			require.NoError(t, err)
			_, err = conn.Exec(ctx, `UPDATE log_instances SET updated_at = CASE id WHEN $1 THEN $2::timestamptz ELSE $3::timestamptz END WHERE id = ANY($4)`,
				anchorID, tc.anchorUpdatedAt, tc.deletedUpdatedAt, []uuid.UUID{anchorID, deletedID})
			conn.Release()
			require.NoError(t, err)

			_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{anchorID})
			require.NoError(t, err)
			before, err := store.RankingRunByID(ctx, anchorID)
			require.NoError(t, err)
			assert.Equal(t, int32(2), before.MemberCount)

			// Simulate losing the targeted refresh enqueue after the delete. The
			// statement trigger must leave enough state for incremental repair.
			_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{deletedID})
			require.NoError(t, err)
			repairs, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
				SourceCutoff: database.Timestamptz(time.Now().Add(time.Hour)), QueryLimit: 10,
			})
			require.NoError(t, err)
			require.Len(t, repairs, 1)
			assert.Equal(t, anchorID, repairs[0].RunID)
			assert.True(t, repairs[0].Stale)

			_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{repairs[0].RunID})
			require.NoError(t, err)
			after, err := store.RankingRunByID(ctx, anchorID)
			require.NoError(t, err)
			assert.Equal(t, int32(1), after.MemberCount)
			assert.True(t, after.SourceUpdatedAt.Time.After(before.SourceUpdatedAt.Time))
		})
	}
}

func TestRankingRunRepairSignalAfterIdentityTransitions(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	oldRunID := uuid.New()
	movedID := uuid.New()
	newRunID := uuid.New()
	start := time.Date(2026, 9, 16, 11, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, oldRunID, start, "Lucifron", "Magmadar")
	insertRankingRunSource(t, pool, store, realmID, movedID, start.Add(time.Second), "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, newRunID, start.Add(2*time.Second), "Lucifron", "Magmadar")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: oldRunID, Valid: true}, Ids: []uuid.UUID{oldRunID, movedID},
	}))
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: newRunID, Valid: true}, Ids: []uuid.UUID{newRunID},
	}))
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{oldRunID, newRunID})
	require.NoError(t, err)

	// Reassign one member. Incremental repair must discover both the old and
	// new logical identities even if the targeted enqueue is missed.
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: newRunID, Valid: true}, Ids: []uuid.UUID{movedID},
	}))
	repairs, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: database.Timestamptz(time.Now().Add(time.Hour)), QueryLimit: 10,
	})
	require.NoError(t, err)
	repairIDs := make([]uuid.UUID, 0, len(repairs))
	for _, repair := range repairs {
		repairIDs = append(repairIDs, repair.RunID)
		assert.True(t, repair.Stale)
	}
	require.ElementsMatch(t, []uuid.UUID{oldRunID, newRunID}, repairIDs)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, repairIDs)
	require.NoError(t, err)
	oldRun, err := store.RankingRunByID(ctx, oldRunID)
	require.NoError(t, err)
	newRun, err := store.RankingRunByID(ctx, newRunID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), oldRun.MemberCount)
	assert.Equal(t, int32(2), newRun.MemberCount)

	// Unlink the member. The old group needs a survivor touch while the new
	// standalone identity is found as a missing projection.
	require.NoError(t, store.ClearDuplicateGroupID(ctx, movedID))
	repairs, err = store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: database.Timestamptz(time.Now().Add(time.Hour)), QueryLimit: 10,
	})
	require.NoError(t, err)
	repairIDs = repairIDs[:0]
	for _, repair := range repairs {
		repairIDs = append(repairIDs, repair.RunID)
	}
	require.ElementsMatch(t, []uuid.UUID{newRunID, movedID}, repairIDs)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, repairIDs)
	require.NoError(t, err)
	newRun, err = store.RankingRunByID(ctx, newRunID)
	require.NoError(t, err)
	standalone, err := store.RankingRunByID(ctx, movedID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), newRun.MemberCount)
	assert.Equal(t, int32(1), standalone.MemberCount)
}

func TestRankingRunRepairSignalWritesAtMostOneSurvivorPerRun(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	start := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	type runMembers struct {
		runID   uuid.UUID
		keepIDs []uuid.UUID
		delete  uuid.UUID
	}
	runs := make([]runMembers, 2)
	allIDs := make([]uuid.UUID, 0, 6)
	deleteIDs := make([]uuid.UUID, 0, 2)
	for i := range runs {
		runs[i] = runMembers{
			runID:   uuid.New(),
			keepIDs: []uuid.UUID{uuid.New(), uuid.New()},
			delete:  uuid.New(),
		}
		ids := []uuid.UUID{runs[i].runID, runs[i].keepIDs[0], runs[i].keepIDs[1], runs[i].delete}
		for j, id := range ids {
			insertRankingRunSource(t, pool, store, realmID, id, start.Add(time.Duration(i*10+j)*time.Second), "Lucifron")
		}
		require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
			DuplicateGroupID: uuid.NullUUID{UUID: runs[i].runID, Valid: true}, Ids: ids,
		}))
		allIDs = append(allIDs, ids...)
		deleteIDs = append(deleteIDs, runs[i].delete)
	}

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	baseline := time.Date(2026, 9, 16, 12, 30, 0, 0, time.UTC)
	_, err = conn.Exec(ctx, "UPDATE log_instances SET updated_at = $1 WHERE id = ANY($2)", baseline, allIDs)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "DELETE FROM log_instances WHERE id = ANY($1)", deleteIDs)
	require.NoError(t, err)

	for _, run := range runs {
		var touched int
		err = conn.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM log_instances
			WHERE (id = $1 OR duplicate_group_id = $1)
			  AND updated_at > $2`, run.runID, baseline).Scan(&touched)
		require.NoError(t, err)
		assert.Equal(t, 1, touched)
	}
	conn.Release()
}

func TestRankingRunRepairDiscoveryCutoffLimitAndOrphans(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	old := time.Now().Add(-2 * time.Hour)
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	for _, id := range ids {
		insertRankingRunSource(t, pool, store, realmID, id, old, "Lucifron")
	}
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "UPDATE log_instances SET updated_at = $1 WHERE id = ANY($2)", old, ids)
	conn.Release()
	require.NoError(t, err)

	rows, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: pgtype.Timestamptz{Time: time.Now().Add(-time.Hour), Valid: true}, QueryLimit: 2,
	})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.True(t, rows[0].Missing)
	assert.True(t, rows[1].Missing)

	recentRows, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: pgtype.Timestamptz{Time: old.Add(-time.Minute), Valid: true}, QueryLimit: 10,
	})
	require.NoError(t, err)
	assert.Empty(t, recentRows)

	sources, err := store.RankingRunSources(ctx, []uuid.UUID{ids[0]})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	orphan := database.UpsertRankingRunParams(sources[0])
	orphan.RunID = uuid.New()
	_, err = store.UpsertRankingRun(ctx, orphan)
	require.NoError(t, err)
	orphans, err := store.OrphanRankingRuns(ctx, 10)
	require.NoError(t, err)
	require.Contains(t, orphans, orphan.RunID)
}
