package serviceinference

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/secrets"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestSearchPageCapabilityAndArguments(t *testing.T) {
	t.Parallel()
	revision := int64(2)
	client, err := advertisedClient(&chroniclesdk.InferenceClient{SessionID: "browser-1", Capabilities: []chroniclesdk.InferenceClientCapability{{ID: searchPageCapabilityID, Version: 1, ScopeType: "search_page", ScopeID: "search", StateRevision: &revision}}}, searchPageCapability, "search")
	require.NoError(t, err)
	require.NotNil(t, client)
	a := withClientTools(assistants["site-help"], client)
	require.Contains(t, a.System, "user must press Search")
	require.Equal(t, "inspect_search_draft", a.Tools[len(a.Tools)-2].Name)
	require.Equal(t, "set_search_draft", a.Tools[len(a.Tools)-1].Name)
	require.Equal(t, "view_mutation", searchPageClientTools[1].Effect)
	require.Equal(t, "unless_yolo", searchPageClientTools[1].Confirmation)
	for _, tool := range searchPageClientTools {
		require.True(t, json.Valid(tool.Parameters))
	}
	_, err = advertisedClient(&chroniclesdk.InferenceClient{SessionID: "browser-1", Capabilities: []chroniclesdk.InferenceClientCapability{{ID: searchPageCapabilityID, Version: 1, ScopeType: "instance", ScopeID: "search"}}}, searchPageCapability, "search")
	require.Error(t, err)
	_, err = advertisedClient(&chroniclesdk.InferenceClient{SessionID: "browser-1", Capabilities: []chroniclesdk.InferenceClientCapability{{ID: searchPageCapabilityID, Version: 1, ScopeType: "search_page", ScopeID: "search"}, {ID: searchPageCapabilityID, Version: 1, ScopeType: "search_page", ScopeID: "search"}}}, searchPageCapability, "search")
	require.Error(t, err)
	_, err = validateClientToolArguments("inspect_search_draft", `{}`)
	require.NoError(t, err)
	for _, args := range []string{`{"extra":1}`, `null`} {
		_, err = validateClientToolArguments("inspect_search_draft", args)
		require.Error(t, err, args)
	}
	valid := `{"expected_revision":2,"where":{"field":"instance.name","op":"=","value":"Naxxramas"}}`
	validated, err := validateClientToolArguments("set_search_draft", valid)
	require.NoError(t, err)
	require.JSONEq(t, valid, string(validated))
	for _, args := range []string{`{}`, `{"where":{}}`, `{"expected_revision":-1,"where":{}}`, `{"expected_revision":2,"where":null}`, `{"expected_revision":2,"where":{"unknown":"x"}}`, `{"expected_revision":2,"where":{},"extra":true}`, `{"expected_revision":2,"where":{"field":"not_a_field","op":"eq","value":"x"}}`} {
		_, err = validateClientToolArguments("set_search_draft", args)
		require.Error(t, err, args)
	}
	pending := database.InferenceClientToolRequest{Status: "pending", ClientSessionID: "browser-1", CapabilityID: searchPageCapabilityID, CapabilityVersion: 1, ScopeType: pgtype.Text{String: "search_page", Valid: true}, ScopeID: pgtype.Text{String: "search", Valid: true}, StateRevision: pgtype.Int8{Int64: revision, Valid: true}, Effect: "view_mutation"}
	response := chroniclesdk.InferenceClientToolResultRequest{ClientSessionID: "browser-1", CapabilityID: searchPageCapabilityID, CapabilityVersion: 1, ScopeType: "search_page", ScopeID: "search", StateRevision: ptr(int64(3))}
	require.NoError(t, validateClientToolContinuation(pending, response, "search"))
	response.ClientSessionID = "other-browser"
	require.ErrorIs(t, validateClientToolContinuation(pending, response, "search"), errClientToolMismatch)
	response.ClientSessionID = "browser-1"
	response.StateRevision = ptr(int64(1))
	require.ErrorIs(t, validateClientToolContinuation(pending, response, "search"), errClientToolMismatch)
}

func TestSiteHelpAgentPausesOnlyForAdvertisedSearchDraft(t *testing.T) {
	t.Parallel()
	capability := &clientCapability{ID: searchPageCapabilityID, Version: 1, ScopeType: "search_page", ScopeID: "search", SessionID: "browser", StateRevision: ptr(int64(4))}
	provider := &scriptedProvider{streams: [][]StreamEvent{{
		{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "call", Name: "set_search_draft", Arguments: `{"expected_revision":4,"where":{"field":"instance.name","op":"=","value":"Naxxramas"}}`}},
		{Type: StreamEventFinish, FinishReason: FinishReasonToolCalls},
	}}}
	var stream strings.Builder
	var captured clientToolPause
	result, err := (&Service{}).agentLoop(context.Background(), agui.NewStreamWriter(&stream, nil), provider, nil, "model", withClientTools(assistants["site-help"], capability), []Message{{Role: RoleUser, Content: "prepare my search"}}, toolContext{}, debugRunContext{RunID: "run", ThreadID: "ephemeral", Persistence: "ephemeral"}, capability, agentLoopState{}, func(...Message) error { t.Fatal("unexpected durable persistence"); return nil }, func(_ Message, _ []Message, pending clientToolPause, _ agentLoopState) error {
		captured = pending
		return nil
	}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Paused)
	require.Equal(t, "set_search_draft", captured.Call.Name)
	require.Equal(t, "view_mutation", captured.Effect)
	require.Equal(t, "unless_yolo", captured.Confirmation)
	require.Contains(t, stream.String(), "CLIENT_TOOL_REQUEST")
	require.NotContains(t, stream.String(), "RUN_FINISHED")
	require.Equal(t, 1, provider.calls)
	// A model cannot submit an old revision even when its tool JSON is otherwise valid.
	provider.calls = 0
	provider.streams[0][0].ToolCall.Arguments = `{"expected_revision":3,"where":{"field":"instance.name","op":"=","value":"Naxxramas"}}`
	_, err = (&Service{}).agentLoop(context.Background(), agui.NewStreamWriter(&strings.Builder{}, nil), provider, nil, "model", withClientTools(assistants["site-help"], capability), []Message{{Role: RoleUser, Content: "prepare my search"}}, toolContext{}, debugRunContext{}, capability, agentLoopState{}, func(...Message) error { return nil }, func(_ Message, _ []Message, _ clientToolPause, _ agentLoopState) error {
		t.Fatal("stale draft sent to client")
		return nil
	}, nil)
	require.ErrorContains(t, err, "revision mismatch")
}

func TestEphemeralClientToolHistoryOnlyWhileAwaiting(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	uid := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: uid, Username: "ephemeral-" + uid.String()[:8]})
	require.NoError(t, err)
	connection, err := store.InsertInferenceConnection(ctx, database.InsertInferenceConnectionParams{UserID: uid, Provider: "openrouter", AuthMode: "oauth", Label: "OpenRouter", EncryptedCredential: []byte("test"), CredentialKeyVersion: "v1", Status: "active"})
	require.NoError(t, err)
	s := &Service{db: store}
	newRun := func(key string) database.InferenceRun {
		run, err := store.InsertInferenceRun(ctx, database.InsertInferenceRunParams{UserID: uid, ConnectionID: connection.ID, AssistantID: "site-help", Model: "test", Status: "running", IdempotencyKey: key, LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(runLease), Valid: true}})
		require.NoError(t, err)
		return run
	}
	capability := clientCapability{ID: searchPageCapabilityID, Version: 1, ScopeType: "search_page", ScopeID: "search", SessionID: "browser-1", StateRevision: ptr(int64(1))}
	pause := func(run database.InferenceRun) {
		require.NoError(t, s.pauseForEphemeralClientTool(ctx, run, []Message{{Role: RoleUser, Content: "help"}, {Role: RoleAssistant, ToolCalls: []ToolCall{{ID: "tool-1", Name: "inspect_search_draft", Arguments: `{}`}}}}, clientToolPause{Call: ToolCall{ID: "tool-1", Name: "inspect_search_draft"}, Arguments: json.RawMessage(`{}`), Capability: capability, Effect: "read", Confirmation: "never"}, agentLoopState{IterationCount: 1, ToolCallCount: 1}))
	}
	run := newRun("ephemeral-pause")
	pause(run)
	paused, err := store.GetInferenceRunByOwner(ctx, database.GetInferenceRunByOwnerParams{ID: run.ID, UserID: uid})
	require.NoError(t, err)
	require.Equal(t, "awaiting_client_tool", paused.Status)
	require.False(t, paused.ThreadID.Valid)
	require.NotEmpty(t, paused.EphemeralHistory)
	_, err = store.GetInferenceRunByOwner(ctx, database.GetInferenceRunByOwnerParams{ID: run.ID, UserID: uuid.New()})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	pending, err := store.GetInferenceClientToolRequestForUpdate(ctx, database.GetInferenceClientToolRequestForUpdateParams{RunID: run.ID, ToolCallID: "tool-1", UserID: uid})
	require.NoError(t, err)
	require.False(t, pending.ThreadID.Valid)
	_, err = store.GetInferenceClientToolRequestForUpdate(ctx, database.GetInferenceClientToolRequestForUpdateParams{RunID: run.ID, ToolCallID: "tool-1", UserID: uuid.New()})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.CompleteInferenceClientToolRequest(ctx, database.CompleteInferenceClientToolRequestParams{RunID: run.ID, ToolCallID: "tool-1"})
	require.NoError(t, err)
	_, err = store.ResumeInferenceRun(ctx, database.ResumeInferenceRunParams{ID: run.ID, UserID: uid, LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(runLease), Valid: true}})
	require.NoError(t, err)
	resumed, err := store.GetInferenceRunByOwner(ctx, database.GetInferenceRunByOwnerParams{ID: run.ID, UserID: uid})
	require.NoError(t, err)
	require.Nil(t, resumed.EphemeralHistory)
	_, err = store.ResumeInferenceRun(ctx, database.ResumeInferenceRunParams{ID: run.ID, UserID: uid})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	require.NoError(t, s.finishRun(ctx, resumed, "completed", agentLoopState{}, ""))
	finished, err := store.GetInferenceRunByOwner(ctx, database.GetInferenceRunByOwnerParams{ID: run.ID, UserID: uid})
	require.NoError(t, err)
	require.Equal(t, "completed", finished.Status)
	require.Nil(t, finished.EphemeralHistory)

	// An expired lease cannot be resumed even if its pending request still exists.
	expired := newRun("ephemeral-expire")
	_, err = store.PauseEphemeralInferenceRun(ctx, database.PauseEphemeralInferenceRunParams{
		ID: expired.ID, UserID: uid, EphemeralHistory: json.RawMessage(`[{"role":"user","content":"help"}]`),
		LeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(-time.Minute), Valid: true},
	})
	require.NoError(t, err)
	_, err = store.ResumeInferenceRun(ctx, database.ResumeInferenceRunParams{ID: expired.ID, UserID: uid})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.ExpireStaleInferenceRuns(ctx)
	require.NoError(t, err)
	abandoned, err := store.GetInferenceRunByOwner(ctx, database.GetInferenceRunByOwnerParams{ID: expired.ID, UserID: uid})
	require.NoError(t, err)
	require.Equal(t, "abandoned", abandoned.Status)
	require.Nil(t, abandoned.EphemeralHistory)
}

func TestSiteHelpHTTPContinuationAcrossRequests(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	uid := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: uid, Username: "site-help-" + uid.String()[:8]})
	require.NoError(t, err)
	cipher, err := secrets.NewCredentialCipher(credentialKeyID, make([]byte, 32))
	require.NoError(t, err)
	credential, err := cipher.Encrypt([]byte("test-key"), credentialAAD(uid.String(), "provider-credential"))
	require.NoError(t, err)
	connection, err := store.InsertInferenceConnection(ctx, database.InsertInferenceConnectionParams{UserID: uid, Provider: "test", AuthMode: "oauth", Label: "Test", EncryptedCredential: credential, CredentialKeyVersion: credentialKeyID, Status: "active"})
	require.NoError(t, err)
	provider := &scriptedProvider{streams: [][]StreamEvent{
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "call-1", Name: "inspect_search_draft", Arguments: `{}`}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventTextDelta, Text: "Press Search when ready."}, {Type: StreamEventFinish, FinishReason: FinishReasonStop}},
	}}
	registry := NewRegistry()
	require.NoError(t, registry.Register(provider))
	s := &Service{db: store, registry: registry, cipher: cipher, enabled: true, logger: slog.Default()}
	s.router = s.routes()
	revision := int64(1)
	client := chroniclesdk.InferenceClient{SessionID: "browser-1", Capabilities: []chroniclesdk.InferenceClientCapability{{ID: searchPageCapabilityID, Version: 1, ScopeType: "search_page", ScopeID: "search", StateRevision: &revision}}}
	body, err := json.Marshal(chroniclesdk.InferenceRunRequest{RunID: "run-1", ConnectionID: connection.ID, Model: "test", AssistantID: "site-help", Client: &client, Messages: []chroniclesdk.InferenceMessage{{Role: "user", Content: "help me search"}}})
	require.NoError(t, err)
	post := func(owner uuid.UUID, path string, body []byte) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(chronauth.WithClaims(ctx, &claims.Claims{Subject: owner}))
		recorder := httptest.NewRecorder()
		s.ServeHTTP(recorder, req)
		return recorder
	}
	first := post(uid, "/runs", body)
	require.Equal(t, http.StatusOK, first.Code, first.Body.String())
	require.Contains(t, first.Body.String(), "CLIENT_TOOL_REQUEST")
	require.NotContains(t, first.Body.String(), "RUN_FINISHED")
	run, err := store.GetInferenceRunByIdempotencyKey(ctx, database.GetInferenceRunByIdempotencyKeyParams{UserID: uid, IdempotencyKey: "run-1"})
	require.NoError(t, err)
	require.Equal(t, "awaiting_client_tool", run.Status)
	require.NotEmpty(t, run.EphemeralHistory)
	path := "/runs/run-1/client-tools/call-1"
	response := chroniclesdk.InferenceClientToolResultRequest{ClientSessionID: "browser-1", CapabilityID: searchPageCapabilityID, CapabilityVersion: 1, ScopeType: "search_page", ScopeID: "search", StateRevision: &revision, Status: "success", Result: json.RawMessage(`{"revision":1,"where":null}`)}
	resultBody, err := json.Marshal(response)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, post(uuid.New(), path, resultBody).Code)
	response.ClientSessionID = "wrong-browser"
	wrongBody, err := json.Marshal(response)
	require.NoError(t, err)
	require.Equal(t, http.StatusConflict, post(uid, path, wrongBody).Code)
	second := post(uid, path, resultBody)
	require.Equal(t, http.StatusOK, second.Code, second.Body.String())
	require.Contains(t, second.Body.String(), "RUN_FINISHED")
	require.Contains(t, second.Body.String(), "Press Search when ready.")
	require.Equal(t, 2, provider.calls)
	require.Equal(t, http.StatusConflict, post(uid, path, resultBody).Code)
	finished, err := store.GetInferenceRunByOwner(ctx, database.GetInferenceRunByOwnerParams{ID: run.ID, UserID: uid})
	require.NoError(t, err)
	require.Equal(t, "completed", finished.Status)
	require.Nil(t, finished.EphemeralHistory)
	require.False(t, finished.ThreadID.Valid)
}

func TestEphemeralHistoryBoundedWithoutDroppingActiveExchange(t *testing.T) {
	t.Parallel()
	messages := []Message{{Role: RoleUser, Content: strings.Repeat("a", maxHistoryBytes)}}
	_, err := ephemeralHistoryJSON(messages)
	require.ErrorContains(t, err, "too large")
	messages = []Message{{Role: RoleUser, Content: strings.Repeat("a", maxHistoryBytes)}, {Role: RoleUser, Content: "current"}, {Role: RoleAssistant, ToolCalls: []ToolCall{{ID: "call", Name: "inspect_search_draft"}}}}
	bounded, err := ephemeralHistoryJSON(messages)
	require.NoError(t, err)
	var decoded []Message
	require.NoError(t, json.Unmarshal(bounded, &decoded))
	require.Len(t, decoded, 2)
	require.Equal(t, "current", decoded[0].Content)
	_, err = ephemeralHistoryJSON([]Message{{Role: RoleAssistant, Content: "no user"}})
	require.Error(t, err)
}
