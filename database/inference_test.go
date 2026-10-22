package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestInferenceRunLifecycleAndCredentialErasure(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "inference-" + userID.String()[:8]})
	require.NoError(t, err)

	connection, err := store.InsertInferenceConnection(ctx, database.InsertInferenceConnectionParams{
		UserID: userID, Provider: "openrouter", AuthMode: "oauth", Label: "OpenRouter",
		EncryptedCredential: []byte("encrypted-secret"), CredentialKeyVersion: "v1",
		ProviderAccountKeyHash: []byte("hash"), Status: "active",
	})
	require.NoError(t, err)
	thread, err := store.InsertInferenceThread(ctx, database.InsertInferenceThreadParams{
		UserID: userID, AssistantID: "instance-analyst", Persistence: "durable",
		ContextType: pgtype.Text{String: "instance", Valid: true},
		ContextID:   pgtype.Text{String: uuid.NewString(), Valid: true}, Title: "Test",
	})
	require.NoError(t, err)

	insertRun := func(key string, lease time.Time) error {
		_, err := store.InsertInferenceRun(ctx, database.InsertInferenceRunParams{
			ThreadID: uuid.NullUUID{UUID: thread.ID, Valid: true}, UserID: userID,
			ConnectionID: connection.ID, AssistantID: "instance-analyst", Model: "model",
			Status: "running", IdempotencyKey: key,
			LeaseExpiresAt: pgtype.Timestamptz{Time: lease, Valid: true},
		})
		return err
	}
	require.NoError(t, insertRun("run-1", time.Now().Add(-time.Minute)))
	err = insertRun("run-2", time.Now().Add(time.Minute))
	require.True(t, database.IsUniqueViolation(err, database.UniqueConstraint("inference_runs_one_running_per_thread_idx")))

	expired, err := store.ExpireStaleInferenceRuns(ctx)
	require.NoError(t, err)
	require.EqualValues(t, 1, expired)
	require.NoError(t, insertRun("run-2", time.Now().Add(time.Minute)))

	require.NoError(t, store.DeleteInferenceConnectionByOwner(ctx, database.DeleteInferenceConnectionByOwnerParams{ID: connection.ID, UserID: userID}))
	rows, err := store.ListInferenceConnectionsByOwner(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, rows)
	var encrypted []byte
	var hash []byte
	err = store.QueryRow(ctx, `SELECT encrypted_credential, provider_account_key_hash FROM inference_connections WHERE id = $1`, connection.ID).Scan(&encrypted, &hash)
	require.NoError(t, err)
	require.Nil(t, encrypted)
	require.Nil(t, hash)
}
