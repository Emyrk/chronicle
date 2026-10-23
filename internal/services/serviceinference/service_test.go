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
	usage, err := s.agentLoop(context.Background(), writer, provider, nil, "model", assistants["site-help"], []Message{{Role: RoleUser, Content: "Where are rankings?"}}, toolContext{service: s}, func(messages ...Message) error {
		persistBatches = append(persistBatches, len(messages))
		persisted = append(persisted, messages...)
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, 2, provider.calls)
	require.Equal(t, 4, usage.PromptTokens)
	require.Equal(t, []int{2, 1}, persistBatches)
	require.Len(t, persisted, 3)
	require.Equal(t, RoleTool, persisted[1].Role)
	require.Contains(t, persisted[1].Content, "/leaderboards/statistics")
	require.Equal(t, "Use Rankings.", persisted[2].Content)
	body := stream.String()
	for _, event := range []string{"TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"} {
		require.True(t, strings.Contains(body, event), event)
	}
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
	_, err := (&Service{}).agentLoop(context.Background(), writer, provider, nil, "model", assistants["site-help"], []Message{{Role: RoleUser, Content: "question"}}, toolContext{}, func(...Message) error {
		return sentinel
	})
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
