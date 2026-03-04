package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDatabaseWorks(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)

	db, pubsub := dbtestutil.NewDB(t)
	dur, err := db.Ping(ctx)
	require.NoError(t, err)
	t.Logf("Ping: %s", dur)

	t.Run("User Insertion in Transaction", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)

		expected := uuid.New()
		err = db.InTx(func(tx database.Store) error {
			_, err := tx.InsertUser(ctx, database.InsertUserParams{
				ID:       expected,
				Username: "random",
			})
			return err
		}, nil)
		require.NoError(t, err)

		user, err := db.GetUserByID(ctx, expected)
		require.NoError(t, err)
		require.Equal(t, expected, user.ID)
		require.Equal(t, "random", user.Username)
	})

	t.Run("Consumed storage uses compressed size when available", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)

		userID := uuid.New()
		_, err := db.InsertUser(ctx, database.InsertUserParams{
			ID:       userID,
			Username: "storage-user",
			Email:    "storage-user@example.com",
		})
		require.NoError(t, err)

		now := time.Now()
		logGroupID := uuid.New()
		_, err = db.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID:        logGroupID,
			Owner:     userID,
			LogType:   database.LogTypeV1,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		require.NoError(t, err)

		compressedSize := int64(400)
		_, err = db.InsertLogFile(ctx, database.InsertLogFileParams{
			ID:                  uuid.New(),
			Owner:               userID,
			Hash:                uuid.NewString(),
			WowLogID:            logGroupID,
			SizeBytes:           1000,
			MimeType:            "text/plain",
			CompressedSizeBytes: database.Int8(&compressedSize),
			CreatedAt:           database.Timestamptz(now),
			UpdatedAt:           database.Timestamptz(now),
		})
		require.NoError(t, err)

		_, err = db.InsertLogFile(ctx, database.InsertLogFileParams{
			ID:        uuid.New(),
			Owner:     userID,
			Hash:      uuid.NewString(),
			WowLogID:  logGroupID,
			SizeBytes: 200,
			MimeType:  "text/plain",
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		require.NoError(t, err)

		user, err := db.GetUserByID(ctx, userID)
		require.NoError(t, err)
		require.Equal(t, int64(600), user.ConsumedStorageBytes)
	})

	t.Run("CountUserPanelLayoutsTotal includes owned and tracked", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)

		ownerID := uuid.New()
		trackerID := uuid.New()
		_, err := db.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "layout-owner"})
		require.NoError(t, err)
		_, err = db.InsertUser(ctx, database.InsertUserParams{ID: trackerID, Username: "layout-tracker"})
		require.NoError(t, err)

		layoutID := uuid.New()
		_, err = db.CreateUserPanelLayout(ctx, database.CreateUserPanelLayoutParams{
			ID:          layoutID,
			UserID:      uuid.NullUUID{UUID: ownerID, Valid: true},
			Title:       "Owner Layout",
			Icon:        "INV_Misc_Book_09",
			Description: "owned",
			Payload:     []byte(`{"items":[]}`),
		})
		require.NoError(t, err)

		_, err = db.TrackUserPanelLayout(ctx, database.TrackUserPanelLayoutParams{
			UserID:   trackerID,
			LayoutID: layoutID,
		})
		require.NoError(t, err)

		ownerTotal, err := db.CountUserPanelLayoutsTotal(ctx, uuid.NullUUID{UUID: ownerID, Valid: true})
		require.NoError(t, err)
		require.Equal(t, int32(1), ownerTotal)

		trackerTotal, err := db.CountUserPanelLayoutsTotal(ctx, uuid.NullUUID{UUID: trackerID, Valid: true})
		require.NoError(t, err)
		require.Equal(t, int32(1), trackerTotal)
	})

	t.Run("Basic pubsub", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		const channel = "test-channel"

		received := make(chan []byte)
		done, err := pubsub.Subscribe(channel, func(ctx context.Context, message []byte) {
			received <- message
		})
		require.NoError(t, err)
		defer done()

		expected := []byte("hello world")
		go func() {
			time.Sleep(time.Millisecond * 50)
			err = pubsub.Publish(channel, expected)
			assert.NoError(t, err)
		}()

		got := testutil.RequireReceive(ctx, t, received)
		require.Equal(t, expected, got)
	})
}
