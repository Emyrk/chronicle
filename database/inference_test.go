package database_test

import (
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
	require.True(t, database.IsUniqueViolation(err, database.UniqueConstraint("inference_runs_one_active_per_thread_idx")))

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

func TestInferenceClientToolPauseContinuationAndExpiry(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	otherUserID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "client-tool-" + userID.String()[:8]})
	require.NoError(t, err)
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: otherUserID, Username: "client-tool-" + otherUserID.String()[:8]})
	require.NoError(t, err)
	connection, err := store.InsertInferenceConnection(ctx, database.InsertInferenceConnectionParams{UserID: userID, Provider: "openrouter", AuthMode: "oauth", Label: "OpenRouter", EncryptedCredential: []byte("encrypted-secret"), CredentialKeyVersion: "v1", Status: "active"})
	require.NoError(t, err)
	instanceID := uuid.NewString()
	thread, err := store.InsertInferenceThread(ctx, database.InsertInferenceThreadParams{UserID: userID, AssistantID: "instance-analyst", Persistence: "durable", ContextType: pgtype.Text{String: "instance", Valid: true}, ContextID: pgtype.Text{String: instanceID, Valid: true}, Title: "Test"})
	require.NoError(t, err)
	run, err := store.InsertInferenceRun(ctx, database.InsertInferenceRunParams{ThreadID: uuid.NullUUID{UUID: thread.ID, Valid: true}, UserID: userID, ConnectionID: connection.ID, AssistantID: "instance-analyst", Model: "model", Status: "running", IdempotencyKey: "client-run", LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Minute), Valid: true}})
	require.NoError(t, err)

	pending, err := store.InsertInferenceClientToolRequest(ctx, database.InsertInferenceClientToolRequestParams{RunID: run.ID, ThreadID: thread.ID, ToolCallID: "call-1", ToolName: "inspect_instance_ui", Arguments: []byte(`{"include":["panels"]}`), CapabilityID: "instance-page", CapabilityVersion: 1, ScopeType: pgtype.Text{String: "instance", Valid: true}, ScopeID: pgtype.Text{String: instanceID, Valid: true}, ClientSessionID: "session-1", StateRevision: pgtype.Int8{Int64: 4, Valid: true}, Effect: "read", Confirmation: "never"})
	require.NoError(t, err)
	require.Equal(t, "pending", pending.Status)
	paused, err := store.PauseInferenceRun(ctx, database.PauseInferenceRunParams{ID: run.ID, UserID: userID, InputTokens: 10, OutputTokens: 2, IterationCount: 1, ToolCallCount: 1, LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Minute), Valid: true}})
	require.NoError(t, err)
	require.Equal(t, "awaiting_client_tool", paused.Status)

	_, err = store.InsertInferenceRun(ctx, database.InsertInferenceRunParams{ThreadID: uuid.NullUUID{UUID: thread.ID, Valid: true}, UserID: userID, ConnectionID: connection.ID, AssistantID: "instance-analyst", Model: "model", Status: "running", IdempotencyKey: "conflict", LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Minute), Valid: true}})
	require.True(t, database.IsUniqueViolation(err, database.UniqueConstraint("inference_runs_one_active_per_thread_idx")))
	_, err = store.GetInferenceClientToolRequestForUpdate(ctx, database.GetInferenceClientToolRequestForUpdateParams{RunID: run.ID, ToolCallID: "call-1", UserID: otherUserID})
	require.ErrorIs(t, err, pgx.ErrNoRows)

	completed, err := store.CompleteInferenceClientToolRequest(ctx, database.CompleteInferenceClientToolRequestParams{RunID: run.ID, ToolCallID: "call-1"})
	require.NoError(t, err)
	require.Equal(t, "completed", completed.Status)
	resumed, err := store.ResumeInferenceRun(ctx, database.ResumeInferenceRunParams{ID: run.ID, UserID: userID, LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(time.Minute), Valid: true}})
	require.NoError(t, err)
	require.Equal(t, "running", resumed.Status)

	_, err = store.InsertInferenceClientToolRequest(ctx, database.InsertInferenceClientToolRequestParams{RunID: run.ID, ThreadID: thread.ID, ToolCallID: "call-2", ToolName: "query_panel", Arguments: []byte(`{"panel_id":"damage"}`), CapabilityID: "instance-page", CapabilityVersion: 1, ScopeType: pgtype.Text{String: "instance", Valid: true}, ScopeID: pgtype.Text{String: instanceID, Valid: true}, ClientSessionID: "session-1", Effect: "read", Confirmation: "never"})
	require.NoError(t, err)
	_, err = store.PauseInferenceRun(ctx, database.PauseInferenceRunParams{ID: run.ID, UserID: userID, InputTokens: 20, OutputTokens: 4, IterationCount: 2, ToolCallCount: 2, LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(-time.Minute), Valid: true}})
	require.NoError(t, err)
	expired, err := store.ExpireStaleInferenceRuns(ctx)
	require.NoError(t, err)
	require.EqualValues(t, 1, expired)
	run, err = store.GetInferenceRunByOwner(ctx, database.GetInferenceRunByOwnerParams{ID: run.ID, UserID: userID})
	require.NoError(t, err)
	require.Equal(t, "abandoned", run.Status)
	pending, err = store.GetInferenceClientToolRequestForUpdate(ctx, database.GetInferenceClientToolRequestForUpdateParams{RunID: run.ID, ToolCallID: "call-2", UserID: userID})
	require.NoError(t, err)
	require.Equal(t, "expired", pending.Status)
}
