// Package serviceinference provides the Chronicle inference service and provider-neutral contracts.
package serviceinference

import "github.com/Emyrk/chronicle/internal/services/serviceinference/contracts"

type ProviderID = contracts.ProviderID
type Role = contracts.Role

const (
	RoleDeveloper = contracts.RoleDeveloper
	RoleSystem    = contracts.RoleSystem
	RoleUser      = contracts.RoleUser
	RoleAssistant = contracts.RoleAssistant
	RoleTool      = contracts.RoleTool
)

type Message = contracts.Message
type ToolCall = contracts.ToolCall
type ToolDefinition = contracts.ToolDefinition
type ModelCapabilities = contracts.ModelCapabilities
type ModelDescriptor = contracts.ModelDescriptor
type ChatRequest = contracts.ChatRequest
type FinishReason = contracts.FinishReason

const (
	FinishReasonStop          = contracts.FinishReasonStop
	FinishReasonLength        = contracts.FinishReasonLength
	FinishReasonToolCalls     = contracts.FinishReasonToolCalls
	FinishReasonContentFilter = contracts.FinishReasonContentFilter
	FinishReasonOther         = contracts.FinishReasonOther
)

type Usage = contracts.Usage
type StreamEventType = contracts.StreamEventType

const (
	StreamEventTextDelta     = contracts.StreamEventTextDelta
	StreamEventToolCallDelta = contracts.StreamEventToolCallDelta
	StreamEventFinish        = contracts.StreamEventFinish
	StreamEventUsage         = contracts.StreamEventUsage
)

type ToolCallDelta = contracts.ToolCallDelta
type StreamEvent = contracts.StreamEvent
type StreamCallback = contracts.StreamCallback
type Provider = contracts.Provider
type History = contracts.History
type EphemeralHistory = contracts.EphemeralHistory
type DurableHistory = contracts.DurableHistory
type AssistantRequest = contracts.AssistantRequest
type RunRequest = contracts.RunRequest
