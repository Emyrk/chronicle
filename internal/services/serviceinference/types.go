// Package serviceinference defines provider-neutral inference contracts.
package serviceinference

import (
	"context"
	"encoding/json"
	"errors"
)

// ProviderID is a stable provider identifier, such as "openrouter".
type ProviderID string

// Role is a normalized chat message role.
type Role string

const (
	RoleDeveloper Role = "developer"
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

// Message is a normalized text or tool chat message.
type Message struct {
	ID         string
	Role       Role
	Name       string
	Content    string
	ToolCallID string
	ToolCalls  []ToolCall
}

// ToolCall is a completed tool call carried in assistant history.
type ToolCall struct {
	ID        string
	Name      string
	Arguments string
}

// ToolDefinition describes a callable function. Parameters is an opaque JSON
// Schema object that providers receive without provider-neutral rewriting.
type ToolDefinition struct {
	Name        string
	Description string
	Parameters  json.RawMessage
}

// ModelCapabilities describes features Chronicle can safely request.
type ModelCapabilities struct {
	Streaming bool
	Tools     bool
}

// ModelDescriptor describes a provider model without exposing provider DTOs.
type ModelDescriptor struct {
	ID            string
	Name          string
	Description   string
	ContextLength int
	Capabilities  ModelCapabilities
}

// ChatRequest is the normalized provider request.
type ChatRequest struct {
	Model       string
	Messages    []Message
	Tools       []ToolDefinition
	Temperature *float64
	MaxTokens   *int
}

// FinishReason is the normalized reason a provider stopped generating.
type FinishReason string

const (
	FinishReasonStop          FinishReason = "stop"
	FinishReasonLength        FinishReason = "length"
	FinishReasonToolCalls     FinishReason = "tool_calls"
	FinishReasonContentFilter FinishReason = "content_filter"
	FinishReasonOther         FinishReason = "other"
)

// Usage is token accounting emitted by a provider when available.
type Usage struct {
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
}

// StreamEventType identifies a normalized streaming callback.
type StreamEventType string

const (
	StreamEventTextDelta     StreamEventType = "text_delta"
	StreamEventToolCallDelta StreamEventType = "tool_call_delta"
	StreamEventFinish        StreamEventType = "finish"
	StreamEventUsage         StreamEventType = "usage"
)

// ToolCallDelta carries provider tool-call fragments. Index is stable within a
// completion. ID, Name, and Arguments may each be partial or empty.
type ToolCallDelta struct {
	Index     int
	ID        string
	Name      string
	Arguments string
}

// StreamEvent is one provider-neutral completion event.
type StreamEvent struct {
	Type         StreamEventType
	Text         string
	ToolCall     ToolCallDelta
	FinishReason FinishReason
	Usage        Usage
}

// StreamCallback receives events in provider order. Returning an error aborts
// the provider request.
type StreamCallback func(StreamEvent) error

// Provider lists models and streams chat completions. credential is opaque to
// the core and must never be retained by an implementation.
type Provider interface {
	ID() ProviderID
	ListModels(ctx context.Context, credential []byte) ([]ModelDescriptor, error)
	StreamChat(ctx context.Context, credential []byte, request ChatRequest, callback StreamCallback) error
}

// History identifies where a run's prior messages come from.
type History interface {
	isHistory()
}

// EphemeralHistory carries caller-owned history that is not tied to a durable
// Chronicle thread.
type EphemeralHistory struct {
	Messages []Message
}

func (EphemeralHistory) isHistory() {}

// DurableHistory references a persisted Chronicle thread without importing a
// generated database identifier type.
type DurableHistory struct {
	ThreadID string
}

func (DurableHistory) isHistory() {}

// AssistantRequest selects a provider/model and tool surface for one assistant.
type AssistantRequest struct {
	ProviderID ProviderID
	Model      string
	Tools      []ToolDefinition
	System     string
}

// RunRequest describes an inference run independently from persistence and HTTP.
type RunRequest struct {
	RunID     string
	History   History
	Assistant AssistantRequest
	Input     Message
}

// Validate performs structural validation that is independent of a provider.
func (r RunRequest) Validate() error {
	if r.History == nil {
		return errors.New("inference history is required")
	}
	switch history := r.History.(type) {
	case EphemeralHistory:
	case DurableHistory:
		if history.ThreadID == "" {
			return errors.New("durable inference thread ID is required")
		}
	default:
		return errors.New("unsupported inference history type")
	}
	if r.Assistant.ProviderID == "" {
		return errors.New("inference provider ID is required")
	}
	if r.Assistant.Model == "" {
		return errors.New("inference model is required")
	}
	return nil
}
