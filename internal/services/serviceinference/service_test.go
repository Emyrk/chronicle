package serviceinference

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestCredentialCipherConfig(t *testing.T) {
	t.Parallel()
	_, err := credentialCipher("not-base64")
	require.ErrorContains(t, err, "decode")
	_, err = credentialCipher(base64.StdEncoding.EncodeToString(make([]byte, 31)))
	require.ErrorContains(t, err, "32 bytes")
	cipher, err := credentialCipher(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	require.NoError(t, err)
	require.NotNil(t, cipher)
}

func TestDisabledRoutesReturnServiceUnavailable(t *testing.T) {
	t.Parallel()
	s := &Service{}
	s.router = s.routes()
	recorder := httptest.NewRecorder()
	s.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/connections", nil))
	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Contains(t, recorder.Body.String(), "not configured")
}

func TestInferenceAccountSettingsOptOutAndBackIn(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)
	userID := uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"inference_capable"}))

	service := &Service{zed: zed, enabled: true, logger: slog.Default()}
	handler := service.AccountRoutes()
	request := func(method, body string) chroniclesdk.InferenceSettings {
		req := httptest.NewRequest(method, "/", strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		var response chroniclesdk.InferenceSettings
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		return response
	}

	initial := request(http.MethodGet, "")
	require.True(t, initial.Available)
	require.False(t, initial.Disabled)
	require.True(t, initial.Enabled)
	require.True(t, initial.ServiceAvailable)

	disabled := request(http.MethodPut, `{"disabled":true}`)
	require.True(t, disabled.Available)
	require.True(t, disabled.Disabled)
	require.False(t, disabled.Enabled)

	reenabled := request(http.MethodPut, `{"disabled":false}`)
	require.True(t, reenabled.Available)
	require.False(t, reenabled.Disabled)
	require.True(t, reenabled.Enabled)
}

func TestInferenceAccountSettingsRejectsOptOutWithoutCapability(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	userID := uuid.New()
	service := &Service{zed: zed, enabled: true, logger: slog.Default()}

	req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"disabled":true}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	recorder := httptest.NewRecorder()
	service.AccountRoutes().ServeHTTP(recorder, req)
	require.Equal(t, http.StatusForbidden, recorder.Code, recorder.Body.String())
	require.Contains(t, recorder.Body.String(), "not enabled")
}

func TestInferenceAccountSettingsAvailableWhenServiceDisabled(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)
	userID := uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"inference_capable"}))

	service := &Service{zed: zed, enabled: false, logger: slog.Default()}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	recorder := httptest.NewRecorder()
	service.AccountRoutes().ServeHTTP(recorder, req)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response chroniclesdk.InferenceSettings
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Available)
	require.False(t, response.ServiceAvailable)
	require.False(t, response.Enabled)
}

func TestOpenRouterCallbackURLCarriesState(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("https://chronicle.example/base?tenant=turtle#fragment")
	require.NoError(t, err)
	callback, err := url.Parse(openRouterCallbackURL(accessURL, "state-token"))
	require.NoError(t, err)
	require.Equal(t, "https", callback.Scheme)
	require.Equal(t, "chronicle.example", callback.Host)
	require.Equal(t, "/api/v1/inference/openrouter/callback", callback.Path)
	require.Equal(t, "turtle", callback.Query().Get("tenant"))
	require.Equal(t, "state-token", callback.Query().Get("state"))
	require.Empty(t, callback.Fragment)
}

func TestSelectableInferenceModelsReturnsEveryToolCapableModel(t *testing.T) {
	t.Parallel()
	models := make([]ModelDescriptor, 0, 26)
	for index := 24; index >= 0; index-- {
		models = append(models, ModelDescriptor{
			ID:           fmt.Sprintf("provider/model-%02d", index),
			Name:         fmt.Sprintf("Model %02d", index),
			Capabilities: ModelCapabilities{Streaming: true, Tools: true},
		})
	}
	models = append(models, ModelDescriptor{
		ID:           "provider/text-only",
		Name:         "Text only",
		Capabilities: ModelCapabilities{Streaming: true},
	})

	selectable := selectableInferenceModels(models)
	require.Len(t, selectable, 25)
	require.Equal(t, "provider/model-00", selectable[0].ID)
	require.Equal(t, "provider/model-24", selectable[24].ID)
}

func TestValidateLocalReturnPath(t *testing.T) {
	t.Parallel()
	for _, valid := range []string{"/settings", "/settings?tab=inference", "/logs/abc#chat"} {
		require.NoError(t, ValidateLocalReturnPath(valid), valid)
	}
	for _, invalid := range []string{"", "https://evil.example", "//evil.example", `/\\evil`, "/ok\r\nLocation: evil"} {
		require.Error(t, ValidateLocalReturnPath(invalid), invalid)
	}
}

type scriptedProvider struct {
	streams [][]StreamEvent
	calls   int
}

func (*scriptedProvider) ID() ProviderID { return "test" }
func (*scriptedProvider) ListModels(context.Context, []byte) ([]ModelDescriptor, error) {
	return nil, nil
}
func (p *scriptedProvider) StreamChat(_ context.Context, _ []byte, _ ChatRequest, callback StreamCallback) error {
	stream := p.streams[p.calls]
	p.calls++
	for _, event := range stream {
		if err := callback(event); err != nil {
			return err
		}
	}
	return nil
}

func TestAgentLoopTextAndToolCall(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{streams: [][]StreamEvent{
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "call-1", Name: "list_pages", Arguments: "{}"}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventTextDelta, Text: "Use Rankings."}, {Type: StreamEventUsage, Usage: Usage{PromptTokens: 4, CompletionTokens: 2, TotalTokens: 6}}, {Type: StreamEventFinish, FinishReason: FinishReasonStop}},
	}}
	var stream bytes.Buffer
	writer := agui.NewStreamWriter(&stream, nil)
	var persisted []Message
	var persistBatches []int
	s := &Service{}
	result, err := s.agentLoop(context.Background(), writer, provider, nil, "model", assistants["site-help"], []Message{{Role: RoleUser, Content: "Where are rankings?"}}, toolContext{service: s}, debugRunContext{}, nil, agentLoopState{}, func(messages ...Message) error {
		persistBatches = append(persistBatches, len(messages))
		persisted = append(persisted, messages...)
		return nil
	}, nil)
	require.NoError(t, err)
	require.Equal(t, 2, provider.calls)
	require.Equal(t, 4, result.State.Usage.PromptTokens)
	require.Equal(t, []int{2, 1}, persistBatches)
	require.Len(t, persisted, 3)
	require.Equal(t, RoleTool, persisted[1].Role)
	require.Contains(t, persisted[1].Content, "/leaderboards/statistics")
	require.Equal(t, "Use Rankings.", persisted[2].Content)
	body := stream.String()
	for _, event := range []string{"TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"} {
		require.True(t, strings.Contains(body, event), event)
	}
	require.NotContains(t, body, "DEBUG_SNAPSHOT")
}

func debugSnapshots(t *testing.T, stream string) []agui.DebugSnapshotEvent {
	t.Helper()
	var snapshots []agui.DebugSnapshotEvent
	for _, line := range strings.Split(stream, "\n") {
		if !strings.HasPrefix(line, "data: ") || !strings.Contains(line, `"type":"DEBUG_SNAPSHOT"`) {
			continue
		}
		var snapshot agui.DebugSnapshotEvent
		require.NoError(t, json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &snapshot))
		snapshots = append(snapshots, snapshot)
	}
	return snapshots
}

func TestAgentLoopDebugSnapshotsMatchProviderRequestsAndResults(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{streams: [][]StreamEvent{
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "call-1", Name: "list_pages", Arguments: "{}"}}, {Type: StreamEventUsage, Usage: Usage{PromptTokens: 3, CompletionTokens: 1, TotalTokens: 4}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventTextDelta, Text: "Use Rankings."}, {Type: StreamEventUsage, Usage: Usage{PromptTokens: 4, CompletionTokens: 2, TotalTokens: 6}}, {Type: StreamEventFinish, FinishReason: FinishReasonStop}},
	}}
	var stream bytes.Buffer
	writer := agui.NewStreamWriter(&stream, nil)
	s := &Service{}
	debug := debugRunContext{Enabled: true, RunID: "run-1", Persistence: "ephemeral"}
	result, err := s.agentLoop(context.Background(), writer, provider, []byte("provider-secret"), "provider/model", assistants["site-help"], []Message{{Role: RoleUser, Content: "Where are rankings?"}}, toolContext{service: s}, debug, nil, agentLoopState{}, func(...Message) error { return nil }, nil)
	require.NoError(t, err)
	require.Equal(t, Usage{PromptTokens: 7, CompletionTokens: 3, TotalTokens: 10}, result.State.Usage)
	require.NotContains(t, stream.String(), "provider-secret")

	snapshots := debugSnapshots(t, stream.String())
	require.Len(t, snapshots, 4)
	request := snapshots[0]
	require.Equal(t, "request", request.Phase)
	require.Equal(t, "run-1", request.RunID)
	require.Equal(t, "provider/model", request.Model)
	require.Equal(t, "ephemeral", request.Persistence)
	require.Equal(t, assistants["site-help"].System, request.Messages[0].Content)
	require.Equal(t, "Where are rankings?", request.Messages[1].Content)
	require.Equal(t, "list_pages", request.Tools[0].Name)
	require.Empty(t, request.Skills)
	require.Equal(t, maxHistoryMessages, request.Limits.MaxHistoryMessages)
	require.Equal(t, maxToolOutput, request.Limits.MaxToolOutput)
	require.Equal(t, agui.DebugUsage{}, request.Usage)

	toolResults := snapshots[1]
	require.Equal(t, "tool_results", toolResults.Phase)
	require.Len(t, toolResults.Messages, 4)
	require.Equal(t, "list_pages", toolResults.Messages[2].ToolCalls[0].Name)
	require.Equal(t, "tool", toolResults.Messages[3].Role)
	require.Contains(t, toolResults.Messages[3].Content, "/leaderboards/statistics")
	require.Equal(t, agui.DebugUsage{PromptTokens: 3, CompletionTokens: 1, TotalTokens: 4}, toolResults.Usage)

	nextRequest := snapshots[2]
	require.Equal(t, "request", nextRequest.Phase)
	require.Equal(t, toolResults.Messages, nextRequest.Messages)

	response := snapshots[3]
	require.Equal(t, "response", response.Phase)
	require.Equal(t, "Use Rankings.", response.Messages[len(response.Messages)-1].Content)
	require.Equal(t, agui.DebugUsage{PromptTokens: 7, CompletionTokens: 3, TotalTokens: 10}, response.Usage)
}

func TestInferenceDebugRequiresPermissionBeforeDatabaseAccess(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	userID := uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(testutil.Context(t, testutil.WaitLong), userID, []string{"inference_capable"}))

	service := &Service{zed: zed, logger: slog.Default()}
	body := `{"run_id":"run-1","debug":true,"connection_id":"00000000-0000-0000-0000-000000000001","model":"provider/model","assistant_id":"site-help","messages":[{"role":"user","content":"help"}]}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	recorder := httptest.NewRecorder()

	// The service intentionally has no database, cipher, or provider. A 403 proves
	// debug authorization happens before any of those dependencies are touched.
	service.run(recorder, req)
	require.Equal(t, http.StatusForbidden, recorder.Code, recorder.Body.String())
	require.Contains(t, recorder.Body.String(), "debug access is not enabled")
}

func TestAgentLoopDoesNotEndMessageBeforePersistence(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{streams: [][]StreamEvent{{
		{Type: StreamEventTextDelta, Text: "provisional"},
		{Type: StreamEventFinish, FinishReason: FinishReasonStop},
	}}}
	var stream bytes.Buffer
	writer := agui.NewStreamWriter(&stream, nil)
	sentinel := errors.New("persist failed")
	_, err := (&Service{}).agentLoop(context.Background(), writer, provider, nil, "model", assistants["site-help"], []Message{{Role: RoleUser, Content: "question"}}, toolContext{}, debugRunContext{}, nil, agentLoopState{}, func(...Message) error {
		return sentinel
	}, nil)
	require.ErrorIs(t, err, sentinel)
	require.Contains(t, stream.String(), "TEXT_MESSAGE_START")
	require.Contains(t, stream.String(), "TEXT_MESSAGE_CONTENT")
	require.NotContains(t, stream.String(), "TEXT_MESSAGE_END")
}

func TestFinalizationContextSurvivesClientCancellation(t *testing.T) {
	t.Parallel()
	parent, cancelParent := context.WithCancel(context.Background())
	cancelParent()

	ctx, cancel := finalizationContext(parent)
	defer cancel()
	require.NoError(t, ctx.Err())
}

func TestBoundedDurableHistoryStartsAtUserAndLimitsBytes(t *testing.T) {
	t.Parallel()
	row := func(role Role, content string) database.InferenceMessage {
		return database.InferenceMessage{ID: uuid.New(), Content: writeJSONMessage(Message{Role: role, Content: content})}
	}
	rows := []database.InferenceMessage{
		row(RoleTool, "orphaned tool result"),
		row(RoleAssistant, "orphaned answer"),
		row(RoleUser, "current question"),
		row(RoleAssistant, strings.Repeat("a", 200)),
	}

	history := boundedHistory(rows)
	require.Len(t, history, 2)
	require.Equal(t, RoleUser, history[0].Role)
	require.Equal(t, "current question", history[0].Content)

	threadMessages := boundedThreadMessages(rows)
	require.Len(t, threadMessages, 2)
	require.Equal(t, string(RoleUser), threadMessages[0].Role)

	oversized := []database.InferenceMessage{
		row(RoleUser, "discarded question"),
		row(RoleAssistant, strings.Repeat("x", maxHistoryBytes)),
		row(RoleUser, "kept question"),
	}
	history = boundedHistory(oversized)
	require.Len(t, history, 1)
	require.Equal(t, "kept question", history[0].Content)
}

func TestToolArgumentsAreStrictAndBounded(t *testing.T) {
	t.Parallel()
	s := &Service{}
	_, err := s.executeTool(context.Background(), toolContext{service: s}, "find_pages", `{"query":"rank","extra":true}`)
	require.Error(t, err)
	_, err = s.executeTool(context.Background(), toolContext{service: s}, "query_rankings", `{"instance_name":"x","limit":11}`)
	require.Error(t, err)
	_, err = s.executeTool(context.Background(), toolContext{service: s}, "query_rankings", `{"instance_name":"x","encounter":"`+strings.Repeat("e", 101)+`"}`)
	require.Error(t, err)
	_, err = s.executeTool(context.Background(), toolContext{service: s}, "unknown", `{}`)
	require.Error(t, err)
}

func TestInstancePageClientCapabilityIsBoundToThreadScope(t *testing.T) {
	t.Parallel()
	revision := int64(3)
	client, err := advertisedInstancePageClient(&chroniclesdk.InferenceClient{SessionID: "session-1", Capabilities: []chroniclesdk.InferenceClientCapability{{ID: "instance-page", Version: 1, ScopeType: "instance", ScopeID: "instance-1", StateRevision: &revision}}}, "instance-1")
	require.NoError(t, err)
	require.Equal(t, "session-1", client.SessionID)
	require.Equal(t, revision, *client.StateRevision)

	_, err = advertisedInstancePageClient(&chroniclesdk.InferenceClient{SessionID: "session-1", Capabilities: []chroniclesdk.InferenceClientCapability{{ID: "instance-page", Version: 1, ScopeType: "instance", ScopeID: "other"}}}, "instance-1")
	require.ErrorContains(t, err, "must match")
	_, err = advertisedInstancePageClient(&chroniclesdk.InferenceClient{SessionID: strings.Repeat("s", maxClientSessionID+1)}, "instance-1")
	require.Error(t, err)
}

func TestClientToolArgumentsAndResultsAreBoundedAndNormalized(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name string
		args string
	}{
		{name: "inspect_instance_ui", args: `{"include":["selection","panels"]}`},
		{name: "query_panel", args: `{"panel_id":"damage","view":"top_entities","limit":50}`},
		{name: "update_instance_ui", args: `{"expected_revision":2,"operations":[{"op":"select_players","ids":["player-1"]}]}`},
	} {
		validated, err := validateClientToolArguments(test.name, test.args)
		require.NoError(t, err, test.name)
		require.JSONEq(t, test.args, string(validated))
	}
	_, err := validateClientToolArguments("query_panel", `{"panel_id":"damage","limit":51}`)
	require.Error(t, err)
	_, err = validateClientToolArguments("update_instance_ui", `{"operations":[{"op":"not_allowed"}]}`)
	require.Error(t, err)

	secret := `{"exception":"database password SECRET"}`
	content, err := normalizedClientToolResult(chroniclesdk.InferenceClientToolResultRequest{Status: "client_error", Result: json.RawMessage(secret)})
	require.NoError(t, err)
	require.JSONEq(t, `{"status":"client_error"}`, content)
	require.NotContains(t, content, "SECRET")
	_, err = normalizedClientToolResult(chroniclesdk.InferenceClientToolResultRequest{Status: "success", Result: json.RawMessage(strings.Repeat("x", maxClientResult+1))})
	require.ErrorContains(t, err, "too large")
}

func TestClientToolContinuationRejectsWrongSessionScopeAndRevision(t *testing.T) {
	t.Parallel()
	revision := int64(7)
	pending := database.InferenceClientToolRequest{Status: "pending", ClientSessionID: "session-1", CapabilityID: "instance-page", CapabilityVersion: 1, ScopeType: pgtype.Text{String: "instance", Valid: true}, ScopeID: pgtype.Text{String: "instance-1", Valid: true}, StateRevision: pgtype.Int8{Int64: revision, Valid: true}, Effect: "read"}
	valid := chroniclesdk.InferenceClientToolResultRequest{ClientSessionID: "session-1", CapabilityID: "instance-page", CapabilityVersion: 1, ScopeType: "instance", ScopeID: "instance-1", StateRevision: &revision, Status: "success", Result: json.RawMessage(`{}`)}
	require.NoError(t, validateClientToolContinuation(pending, valid, "instance-1"))

	wrongSession := valid
	wrongSession.ClientSessionID = "session-2"
	require.ErrorIs(t, validateClientToolContinuation(pending, wrongSession, "instance-1"), errClientToolMismatch)
	wrongScope := valid
	wrongScope.ScopeID = "instance-2"
	require.ErrorIs(t, validateClientToolContinuation(pending, wrongScope, "instance-1"), errClientToolMismatch)
	wrongRevision := valid
	otherRevision := int64(8)
	wrongRevision.StateRevision = &otherRevision
	require.ErrorIs(t, validateClientToolContinuation(pending, wrongRevision, "instance-1"), errClientToolMismatch)
	pending.Status = "completed"
	require.ErrorIs(t, validateClientToolContinuation(pending, valid, "instance-1"), errClientToolMismatch)
}

func TestAgentLoopPausesAndCanPauseAgainForClientTools(t *testing.T) {
	t.Parallel()
	capability := &clientCapability{ID: "instance-page", Version: 1, ScopeType: "instance", ScopeID: "instance-1", SessionID: "session-1"}
	assistantDefinition := withClientTools(assistants["instance-analyst"], capability)
	provider := &scriptedProvider{streams: [][]StreamEvent{
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "call-1", Name: "inspect_instance_ui", Arguments: `{"include":["panels"]}`}}, {Type: StreamEventUsage, Usage: Usage{PromptTokens: 3, CompletionTokens: 1, TotalTokens: 4}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "call-2", Name: "query_panel", Arguments: `{"panel_id":"damage"}`}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
	}}
	var stream bytes.Buffer
	writer := agui.NewStreamWriter(&stream, nil)
	var pauses []clientToolPause
	pause := func(_ Message, toolMessages []Message, pending clientToolPause, _ agentLoopState) error {
		require.Empty(t, toolMessages)
		pauses = append(pauses, pending)
		return nil
	}
	persist := func(...Message) error {
		t.Fatal("client tool assistant message must use atomic pause persistence")
		return nil
	}
	debug := debugRunContext{RunID: "run-1", ThreadID: "thread-1", Persistence: "durable"}
	first, err := (&Service{}).agentLoop(context.Background(), writer, provider, nil, "model", assistantDefinition, []Message{{Role: RoleUser, Content: "inspect"}}, toolContext{}, debug, capability, agentLoopState{}, persist, pause)
	require.NoError(t, err)
	require.NotNil(t, first.Paused)
	require.Equal(t, 1, first.State.IterationCount)
	require.Equal(t, 1, first.State.ToolCallCount)
	require.Contains(t, stream.String(), "CLIENT_TOOL_REQUEST")
	require.Contains(t, stream.String(), `"effect":"read"`)
	require.NotContains(t, stream.String(), "RUN_FINISHED")

	second, err := (&Service{}).agentLoop(context.Background(), writer, provider, nil, "model", assistantDefinition, []Message{{Role: RoleUser, Content: "inspect"}, {Role: RoleAssistant, ToolCalls: []ToolCall{{ID: "call-1", Name: "inspect_instance_ui", Arguments: `{}`}}}, {Role: RoleTool, Name: "inspect_instance_ui", ToolCallID: "call-1", Content: `{"status":"success","result":{}}`}}, toolContext{}, debug, capability, first.State, persist, pause)
	require.NoError(t, err)
	require.NotNil(t, second.Paused)
	require.Equal(t, 2, second.State.IterationCount)
	require.Equal(t, 2, second.State.ToolCallCount)
	require.Len(t, pauses, 2)
	require.Equal(t, "call-2", pauses[1].Call.ID)
}
