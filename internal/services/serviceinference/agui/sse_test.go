package agui

import (
	"bytes"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriterExactFramingAndSequence(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	flushes := 0
	writer := NewStreamWriter(&output, func() error {
		flushes++
		return nil
	})

	require.NoError(t, writer.Write(TextMessageStartEvent{MessageID: "message-1", Role: "assistant"}))
	require.NoError(t, writer.Write(TextMessageContentEvent{MessageID: "message-1", Delta: "hello"}))
	require.Equal(t, 2, flushes)
	require.Equal(t, "id: 1\nevent: TEXT_MESSAGE_START\ndata: {\"type\":\"TEXT_MESSAGE_START\",\"messageId\":\"message-1\",\"role\":\"assistant\"}\n\n"+
		"id: 2\nevent: TEXT_MESSAGE_CONTENT\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"message-1\",\"delta\":\"hello\"}\n\n", output.String())
}

func TestWriterSerializesDebugSnapshot(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	writer := NewStreamWriter(&output, nil)
	event := DebugSnapshotEvent{
		RunID:       "run-1",
		Iteration:   2,
		Phase:       "request",
		AssistantID: "site-help",
		Model:       "provider/model",
		Persistence: "ephemeral",
		Messages:    []DebugMessage{{Role: "system", Content: "instructions"}},
		Tools:       []DebugTool{},
		Skills:      []DebugSkill{},
		Limits:      DebugLimits{MaxIterations: 5},
		Usage:       DebugUsage{PromptTokens: 7, TotalTokens: 7},
	}
	require.NoError(t, writer.Write(event))

	body := output.String()
	require.Contains(t, body, "event: DEBUG_SNAPSHOT\n")
	require.Contains(t, body, `"type":"DEBUG_SNAPSHOT"`)
	require.Contains(t, body, `"messages":[{"role":"system","content":"instructions"}]`)
	require.Contains(t, body, `"tools":[],"skills":[]`)
	require.Contains(t, body, `"promptTokens":7`)
}

func TestWriterSerializesClientToolRequest(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	writer := NewStreamWriter(&output, nil)
	revision := int64(4)
	require.NoError(t, writer.Write(ClientToolRequestEvent{
		RunID: "run-1", ThreadID: "thread-1", ToolCallID: "call-1", ToolName: "query_panel",
		Arguments:       []byte(`{"panel_id":"damage"}`),
		Capability:      ClientToolCapability{ID: "instance-page", Version: 1, ScopeType: "instance", ScopeID: "instance-1", StateRevision: &revision},
		ClientSessionID: "session-1", Effect: "read", Confirmation: "never",
	}))
	body := output.String()
	require.Contains(t, body, "event: CLIENT_TOOL_REQUEST\n")
	require.Contains(t, body, `"runId":"run-1"`)
	require.Contains(t, body, `"arguments":{"panel_id":"damage"}`)
	require.Contains(t, body, `"capability":{"id":"instance-page","version":1,"scopeType":"instance","scopeId":"instance-1","stateRevision":4}`)
	require.Contains(t, body, `"clientSessionId":"session-1"`)
}

func TestWriterEscapesDataNewlines(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	writer := NewStreamWriter(&output, nil)
	require.NoError(t, writer.Write(TextMessageContentEvent{MessageID: "m\n1", Delta: "first\nsecond\rthird"}))

	require.Equal(t, "id: 1\nevent: TEXT_MESSAGE_CONTENT\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"m\\n1\",\"delta\":\"first\\nsecond\\rthird\"}\n\n", output.String())
}

func TestWriterReturnsFlushError(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	writer := NewStreamWriter(&output, func() error { return errors.New("broken") })
	err := writer.Write(RunErrorEvent{Message: "failed"})
	require.ErrorContains(t, err, "flush AG-UI event")
	require.NotEmpty(t, output.String())
}

func TestNewWriterHeaders(t *testing.T) {
	t.Parallel()

	response := httptest.NewRecorder()
	writer := NewWriter(response)
	require.Equal(t, "text/event-stream", response.Header().Get("Content-Type"))
	require.Equal(t, "no-cache", response.Header().Get("Cache-Control"))
	require.Equal(t, "no", response.Header().Get("X-Accel-Buffering"))

	err := writer.Write(RunStartedEvent{ThreadID: "thread", RunID: "run", ProtocolVersion: "1.0"})
	require.NoError(t, err)
	require.True(t, response.Flushed)
}
