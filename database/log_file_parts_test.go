package database_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestReserveLogFilePartConcurrentAndIdempotent(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fileID := insertPartFixture(t, ctx, store)

	uploadIDs := []uuid.UUID{uuid.New(), uuid.New()}
	parts := make([]database.LogFilePart, len(uploadIDs))
	errs := make([]error, len(uploadIDs))
	var wg sync.WaitGroup
	for i := range uploadIDs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = store.InTx(ctx, func(tx database.Store) error {
				if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
					return err
				}
				var err error
				parts[i], err = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
					PartID: uuid.New(), LogFileID: fileID, UploadID: uploadIDs[i], ReservationID: uuid.New(), ObjectKey: "parts/" + uploadIDs[i].String(),
				})
				return err
			}, nil)
		}(i)
	}
	wg.Wait()
	for _, err := range errs {
		require.NoError(t, err)
	}
	require.ElementsMatch(t, []int64{1, 2}, []int64{parts[0].Sequence, parts[1].Sequence})

	var retry database.LogFilePart
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
			return err
		}
		var err error
		retry, err = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
			PartID: uuid.New(), LogFileID: fileID, UploadID: uploadIDs[0], ReservationID: uuid.New(), ObjectKey: "different-key",
		})
		return err
	}, nil))
	require.Equal(t, parts[0].ID, retry.ID)
	require.Equal(t, parts[0].ObjectKey, retry.ObjectKey)

	finalize := func(part database.LogFilePart) {
		_, err := store.FinalizeLogFilePart(ctx, database.FinalizeLogFilePartParams{
			ID:                  part.ID,
			ReservationID:       part.ReservationID,
			Hash:                pgtype.Text{String: uuid.NewString(), Valid: true},
			SizeBytes:           pgtype.Int8{Int64: 1, Valid: true},
			CompressedSizeBytes: pgtype.Int8{Int64: 1, Valid: true},
			ContentEncoding:     pgtype.Text{String: "gzip", Valid: true},
		})
		require.NoError(t, err)
	}
	partBySequence := map[int64]database.LogFilePart{parts[0].Sequence: parts[0], parts[1].Sequence: parts[1]}
	finalize(partBySequence[2])
	ready, err := store.ListReadyLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Empty(t, ready, "a later ready part must remain hidden behind an earlier pending part")
	finalize(partBySequence[1])
	ready, err = store.ListReadyLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Equal(t, []int64{1, 2}, []int64{ready[0].Sequence, ready[1].Sequence})
}

func TestLogFilePartSourceOrderingAndStaleRecovery(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fileID := insertPartFixture(t, ctx, store)

	reserve := func(sourceSequence pgtype.Int8) database.LogFilePart {
		var part database.LogFilePart
		require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
				return err
			}
			var err error
			part, err = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
				PartID:         uuid.New(),
				LogFileID:      fileID,
				UploadID:       uuid.New(),
				ReservationID:  uuid.New(),
				SourceSequence: sourceSequence,
				ObjectKey:      "parts/" + uuid.NewString(),
			})
			return err
		}, nil))
		return part
	}
	finalize := func(part database.LogFilePart) {
		_, err := store.FinalizeLogFilePart(ctx, database.FinalizeLogFilePartParams{
			ID:                  part.ID,
			ReservationID:       part.ReservationID,
			Hash:                pgtype.Text{String: uuid.NewString(), Valid: true},
			SizeBytes:           pgtype.Int8{Int64: 1, Valid: true},
			CompressedSizeBytes: pgtype.Int8{Int64: 1, Valid: true},
			ContentEncoding:     pgtype.Text{String: "gzip", Valid: true},
		})
		require.NoError(t, err)
	}

	lateSource := reserve(pgtype.Int8{Int64: 100, Valid: true})
	earlySource := reserve(pgtype.Int8{Int64: 2, Valid: true})
	headerless := reserve(pgtype.Int8{})
	stale := reserve(pgtype.Int8{Int64: 1, Valid: true})
	for _, part := range []database.LogFilePart{lateSource, earlySource, headerless} {
		finalize(part)
	}

	expired, err := store.ExpireStaleLogFileParts(ctx, database.ExpireStaleLogFilePartsParams{
		LogFileID:   fileID,
		StaleBefore: database.Timestamptz(time.Now().Add(time.Minute)),
	})
	require.NoError(t, err)
	require.Len(t, expired, 1)
	require.Equal(t, stale.ID, expired[0].ID)

	require.NoError(t, store.AddReadyLogFilePartSizes(ctx, database.AddReadyLogFilePartSizesParams{
		ID:                  fileID,
		SizeBytes:           3,
		CompressedSizeBytes: pgtype.Int8{Int64: 2, Valid: true},
	}))
	file, err := store.GetLogFile(ctx, fileID)
	require.NoError(t, err)
	require.Equal(t, int64(4), file.SizeBytes)
	require.False(t, file.CompressedSizeBytes.Valid, "a plaintext base has no meaningful aggregate compressed size")

	ready, err := store.ListReadyLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{earlySource.ID, lateSource.ID, headerless.ID}, []uuid.UUID{ready[0].ID, ready[1].ID, ready[2].ID})
}

func TestListFinalizedLogFilePartsIncludesEveryReadyPart(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fileID := insertPartFixture(t, ctx, store)

	reserve := func(sourceSequence int64) database.LogFilePart {
		var part database.LogFilePart
		require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
				return err
			}
			var err error
			part, err = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
				PartID: uuid.New(), LogFileID: fileID, UploadID: uuid.New(), ReservationID: uuid.New(),
				SourceSequence: pgtype.Int8{Int64: sourceSequence, Valid: true}, ObjectKey: "parts/" + uuid.NewString(),
			})
			return err
		}, nil))
		return part
	}
	finalize := func(part database.LogFilePart) {
		_, err := store.FinalizeLogFilePart(ctx, database.FinalizeLogFilePartParams{
			ID: part.ID, ReservationID: part.ReservationID,
			Hash: pgtype.Text{String: uuid.NewString(), Valid: true}, SizeBytes: pgtype.Int8{Int64: 10, Valid: true},
			CompressedSizeBytes: pgtype.Int8{Int64: 5, Valid: true}, ContentEncoding: pgtype.Text{String: "gzip", Valid: true},
		})
		require.NoError(t, err)
	}

	later := reserve(2)
	earlierPending := reserve(1)
	finalize(later)

	parseReady, err := store.ListReadyLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Empty(t, parseReady)

	displayReady, err := store.ListFinalizedLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{later.ID}, []uuid.UUID{displayReady[0].ID})

	finalize(earlierPending)
	displayReady, err = store.ListFinalizedLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{earlierPending.ID, later.ID}, []uuid.UUID{displayReady[0].ID, displayReady[1].ID})
}

func TestLogFilePartReservationFencesExpiredUploader(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fileID := insertPartFixture(t, ctx, store)
	uploadID := uuid.New()

	reserve := func(reservationID uuid.UUID, objectKey string, sourceSequence pgtype.Int8) database.LogFilePart {
		var part database.LogFilePart
		require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
				return err
			}
			var err error
			part, err = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
				PartID: uuid.New(), LogFileID: fileID, UploadID: uploadID,
				ReservationID: reservationID, SourceSequence: sourceSequence, ObjectKey: objectKey,
			})
			return err
		}, nil))
		return part
	}

	oldReservation := uuid.New()
	oldPart := reserve(oldReservation, "parts/old", pgtype.Int8{Int64: 1, Valid: true})
	expired, err := store.ExpireStaleLogFileParts(ctx, database.ExpireStaleLogFilePartsParams{
		LogFileID: fileID, StaleBefore: database.Timestamptz(time.Now().Add(time.Minute)),
	})
	require.NoError(t, err)
	require.Len(t, expired, 1)

	newReservation := uuid.New()
	newPart := reserve(newReservation, "parts/new", pgtype.Int8{Int64: 1, Valid: true})
	require.Equal(t, oldPart.ID, newPart.ID)
	require.Equal(t, newReservation, newPart.ReservationID)
	require.Equal(t, "parts/new", newPart.ObjectKey)

	_, err = store.FinalizeLogFilePart(ctx, database.FinalizeLogFilePartParams{
		ID: oldPart.ID, ReservationID: oldReservation,
		Hash: pgtype.Text{String: "old", Valid: true}, SizeBytes: pgtype.Int8{Int64: 1, Valid: true},
		CompressedSizeBytes: pgtype.Int8{Int64: 1, Valid: true}, ContentEncoding: pgtype.Text{String: "gzip", Valid: true},
	})
	require.ErrorIs(t, err, pgx.ErrNoRows)

	_, err = store.FinalizeLogFilePart(ctx, database.FinalizeLogFilePartParams{
		ID: newPart.ID, ReservationID: newReservation,
		Hash: pgtype.Text{String: "new", Valid: true}, SizeBytes: pgtype.Int8{Int64: 1, Valid: true},
		CompressedSizeBytes: pgtype.Int8{Int64: 1, Valid: true}, ContentEncoding: pgtype.Text{String: "gzip", Valid: true},
	})
	require.NoError(t, err)
}

func TestLogFilePartRejectsDuplicateSourceSequence(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fileID := insertPartFixture(t, ctx, store)

	reserve := func(uploadID uuid.UUID) error {
		return store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
				return err
			}
			_, err := tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
				PartID: uuid.New(), LogFileID: fileID, UploadID: uploadID, ReservationID: uuid.New(),
				SourceSequence: pgtype.Int8{Int64: 7, Valid: true}, ObjectKey: "parts/" + uploadID.String(),
			})
			return err
		}, nil)
	}

	require.NoError(t, reserve(uuid.New()))
	require.Error(t, reserve(uuid.New()))
}

func TestCountUserLogFileParts(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fileID := insertPartFixture(t, ctx, store)

	reserve := func(countsTowardLimit bool) database.LogFilePart {
		var part database.LogFilePart
		require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
				return err
			}
			var err error
			part, err = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
				PartID:                uuid.New(),
				LogFileID:             fileID,
				UploadID:              uuid.New(),
				ReservationID:         uuid.New(),
				ObjectKey:             "parts/" + uuid.NewString(),
				CountsTowardUserLimit: countsTowardLimit,
			})
			return err
		}, nil))
		return part
	}

	var counted []database.LogFilePart
	for range 5 {
		counted = append(counted, reserve(true))
	}
	reserve(false)
	count, err := store.CountUserLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Equal(t, int64(5), count)

	require.NoError(t, store.MarkLogFilePartFailed(ctx, database.MarkLogFilePartFailedParams{
		ID: counted[0].ID, ReservationID: counted[0].ReservationID,
	}))
	count, err = store.CountUserLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Equal(t, int64(4), count)
}

func TestLogFilePartsCountTowardUserStorage(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "part-storage-" + ownerID.String(), Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)

	now := database.Timestamptz(time.Now())
	groupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: groupID, Owner: ownerID, LogType: database.LogTypeAzerothcore, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	fileID := uuid.New()
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: fileID, Owner: ownerID, Hash: uuid.NewString(), WowLogID: groupID,
		SizeBytes: 100, MimeType: "text/plain", CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	_, err = store.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{
		ID: uuid.New(), LogGroupID: groupID, Kind: "sidekick-storage", SchemaVersion: 1,
		Hash: uuid.NewString(), SizeBytes: 30, MimeType: "application/octet-stream",
		ObjectKey: "artifacts/" + uuid.NewString(), CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	var part database.LogFilePart
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.LockLogFilePartSequence(ctx, fileID); err != nil {
			return err
		}
		var reserveErr error
		part, reserveErr = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
			PartID: uuid.New(), LogFileID: fileID, UploadID: uuid.New(),
			ReservationID: uuid.New(), ObjectKey: "parts/" + uuid.NewString(),
		})
		return reserveErr
	}, nil))

	_, err = store.FinalizeLogFilePart(ctx, database.FinalizeLogFilePartParams{
		ID: part.ID, ReservationID: part.ReservationID,
		Hash:                pgtype.Text{String: uuid.NewString(), Valid: true},
		SizeBytes:           pgtype.Int8{Int64: 80, Valid: true},
		CompressedSizeBytes: pgtype.Int8{Int64: 20, Valid: true},
		ContentEncoding:     pgtype.Text{String: "gzip", Valid: true},
	})
	require.NoError(t, err)
	require.NoError(t, store.AddReadyLogFilePartSizes(ctx, database.AddReadyLogFilePartSizesParams{
		ID: fileID, SizeBytes: 80, CompressedSizeBytes: pgtype.Int8{Int64: 20, Valid: true},
	}))

	user, err := store.GetUserByID(ctx, ownerID)
	require.NoError(t, err)
	require.Equal(t, int64(150), user.ConsumedStorageBytes)
}

func insertPartFixture(t *testing.T, ctx context.Context, store database.Store) uuid.UUID {
	t.Helper()
	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "part-" + ownerID.String(), Email: ownerID.String() + "@example.com"})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	groupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: groupID, Owner: ownerID, LogType: database.LogTypeAzerothcore, CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	fileID := uuid.New()
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{ID: fileID, Owner: ownerID, Hash: uuid.NewString(), WowLogID: groupID, SizeBytes: 1, MimeType: "text/plain", CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	return fileID
}
