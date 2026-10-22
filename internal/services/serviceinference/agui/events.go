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
