// Package agui implements the small AG-UI 1.0 event subset used by Chronicle.
package agui

import "encoding/json"

// EventType is an AG-UI 1.0 event discriminator.
type EventType string

const (
	RunStarted         EventType = "RUN_STARTED"
	RunFinished        EventType = "RUN_FINISHED"
	RunError           EventType = "RUN_ERROR"
	TextMessageStart   EventType = "TEXT_MESSAGE_START"
	TextMessageContent EventType = "TEXT_MESSAGE_CONTENT"
	TextMessageEnd     EventType = "TEXT_MESSAGE_END"
	ToolCallStart      EventType = "TOOL_CALL_START"
	ToolCallArgs       EventType = "TOOL_CALL_ARGS"
	ToolCallEnd        EventType = "TOOL_CALL_END"
	ClientToolRequest  EventType = "CLIENT_TOOL_REQUEST"
	DebugSnapshot      EventType = "DEBUG_SNAPSHOT"
)

// Event is an AG-UI event that can be written to an SSE stream.
type Event interface {
	EventType() EventType
}

// BaseEvent contains optional fields shared by AG-UI events.
type BaseEvent struct {
	Timestamp *int64                     `json:"timestamp,omitempty"`
	RawEvent  json.RawMessage            `json:"rawEvent,omitempty"`
	Metadata  map[string]json.RawMessage `json:"metadata,omitempty"`
}

type RunStartedEvent struct {
	BaseEvent
	ThreadID        string `json:"threadId"`
	RunID           string `json:"runId"`
	ProtocolVersion string `json:"protocolVersion,omitempty"`
	ParentRunID     string `json:"parentRunId,omitempty"`
}

func (RunStartedEvent) EventType() EventType { return RunStarted }

type RunFinishedEvent struct {
	BaseEvent
	ThreadID string          `json:"threadId"`
	RunID    string          `json:"runId"`
	Result   json.RawMessage `json:"result,omitempty"`
}

func (RunFinishedEvent) EventType() EventType { return RunFinished }

type RunErrorEvent struct {
	BaseEvent
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

func (RunErrorEvent) EventType() EventType { return RunError }

type TextMessageStartEvent struct {
	BaseEvent
	MessageID string `json:"messageId"`
	Role      string `json:"role,omitempty"`
	Name      string `json:"name,omitempty"`
}

func (TextMessageStartEvent) EventType() EventType { return TextMessageStart }

type TextMessageContentEvent struct {
	BaseEvent
	MessageID string `json:"messageId"`
	Delta     string `json:"delta"`
}

func (TextMessageContentEvent) EventType() EventType { return TextMessageContent }

type TextMessageEndEvent struct {
	BaseEvent
	MessageID string `json:"messageId"`
}

func (TextMessageEndEvent) EventType() EventType { return TextMessageEnd }

type ToolCallStartEvent struct {
	BaseEvent
	ToolCallID      string `json:"toolCallId"`
	ToolCallName    string `json:"toolCallName"`
	ParentMessageID string `json:"parentMessageId,omitempty"`
}

func (ToolCallStartEvent) EventType() EventType { return ToolCallStart }

type ToolCallArgsEvent struct {
	BaseEvent
	ToolCallID string `json:"toolCallId"`
	Delta      string `json:"delta"`
}

func (ToolCallArgsEvent) EventType() EventType { return ToolCallArgs }

type ToolCallEndEvent struct {
	BaseEvent
	ToolCallID string `json:"toolCallId"`
}

func (ToolCallEndEvent) EventType() EventType { return ToolCallEnd }

type ClientToolCapability struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

type ClientToolRequestEvent struct {
	BaseEvent
	RunID        string               `json:"runId"`
	ThreadID     string               `json:"threadId"`
	ToolCallID   string               `json:"toolCallId"`
	ToolName     string               `json:"toolName"`
	Arguments    json.RawMessage      `json:"arguments"`
	Capability   ClientToolCapability `json:"capability"`
	Effect       string               `json:"effect"`
	Confirmation string               `json:"confirmation"`
}

func (ClientToolRequestEvent) EventType() EventType { return ClientToolRequest }

type DebugToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type DebugMessage struct {
	Role       string          `json:"role"`
	Name       string          `json:"name,omitempty"`
	Content    string          `json:"content"`
	ToolCallID string          `json:"toolCallId,omitempty"`
	ToolCalls  []DebugToolCall `json:"toolCalls,omitempty"`
}

type DebugTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

type DebugSkill struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Version            string   `json:"version,omitempty"`
	Source             string   `json:"source,omitempty"`
	PromptContribution string   `json:"promptContribution,omitempty"`
	Tools              []string `json:"tools,omitempty"`
}

type DebugLimits struct {
	MaxHistoryMessages int `json:"maxHistoryMessages"`
	MaxHistoryBytes    int `json:"maxHistoryBytes"`
	MaxIterations      int `json:"maxIterations"`
	MaxToolCalls       int `json:"maxToolCalls"`
	MaxToolArguments   int `json:"maxToolArguments"`
	MaxToolOutput      int `json:"maxToolOutput"`
	MaxAssistantText   int `json:"maxAssistantText"`
}

type DebugUsage struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}

type DebugSnapshotEvent struct {
	BaseEvent
	RunID       string         `json:"runId"`
	Iteration   int            `json:"iteration"`
	Phase       string         `json:"phase"`
	AssistantID string         `json:"assistantId"`
	Model       string         `json:"model"`
	Persistence string         `json:"persistence"`
	ContextType string         `json:"contextType,omitempty"`
	ContextID   string         `json:"contextId,omitempty"`
	Messages    []DebugMessage `json:"messages"`
	Tools       []DebugTool    `json:"tools"`
	Skills      []DebugSkill   `json:"skills"`
	Limits      DebugLimits    `json:"limits"`
	Usage       DebugUsage     `json:"usage"`
}

func (DebugSnapshotEvent) EventType() EventType { return DebugSnapshot }
