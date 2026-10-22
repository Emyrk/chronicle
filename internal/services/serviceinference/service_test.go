package serviceinference

import (
	"bytes"
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
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
	s := &Service{}
	usage, err := s.agentLoop(context.Background(), writer, provider, nil, "model", assistants["site-help"], []Message{{Role: RoleUser, Content: "Where are rankings?"}}, toolContext{service: s}, func(m Message) error { persisted = append(persisted, m); return nil })
	require.NoError(t, err)
	require.Equal(t, 2, provider.calls)
	require.Equal(t, 4, usage.PromptTokens)
	require.Len(t, persisted, 3)
	require.Equal(t, RoleTool, persisted[1].Role)
	require.Contains(t, persisted[1].Content, "/leaderboards/statistics")
	require.Equal(t, "Use Rankings.", persisted[2].Content)
	body := stream.String()
	for _, event := range []string{"TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"} {
		require.True(t, strings.Contains(body, event), event)
	}
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
	_, err = s.executeTool(context.Background(), toolContext{service: s}, "unknown", `{}`)
	require.Error(t, err)
}
