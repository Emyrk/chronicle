package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type InferenceSettings struct {
	Available        bool `json:"available"`
	Disabled         bool `json:"disabled"`
	Enabled          bool `json:"enabled"`
	ServiceAvailable bool `json:"service_available"`
	// Assistants lists every assistant with the user's choice. Each still needs AI features to be enabled.
	Assistants []InferenceAssistantSetting `json:"assistants"`
}

type InferenceAssistantSetting struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
}

// UpdateInferenceSettingsRequest changes only the fields that are present.
type UpdateInferenceSettingsRequest struct {
	Disabled *bool `json:"disabled,omitempty"`
	// Assistants maps assistant IDs to whether the user wants them on.
	Assistants map[string]bool `json:"assistants,omitempty"`
}

type InferenceConnection struct {
	ID         uuid.UUID  `json:"id"`
	Provider   string     `json:"provider"`
	AuthMode   string     `json:"auth_mode"`
	Label      string     `json:"label"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

type InferenceConnectionsResponse struct {
	Connections []InferenceConnection `json:"connections"`
}
type InferenceAuthorizeRequest struct {
	ReturnPath string `json:"return_path"`
}
type InferenceAuthorizeResponse struct {
	AuthorizeURL string `json:"authorize_url"`
}

type InferenceModel struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description,omitempty"`
	ContextLength int    `json:"context_length"`
}
type InferenceModelsResponse struct {
	Models []InferenceModel `json:"models"`
}

type InferenceMessage struct {
	ID         string `json:"id,omitempty"`
	Role       string `json:"role"`
	Content    string `json:"content"`
	Name       string `json:"name,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
	// Usage is the model call that wrote this assistant message, when it was recorded.
	Usage *InferenceUsage `json:"usage,omitempty"`
}

// InferenceUsage is token and cost accounting summed over one or more model calls.
type InferenceUsage struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	// CachedTokens and ReasoningTokens are subsets of PromptTokens and CompletionTokens.
	CachedTokens    int64 `json:"cached_tokens"`
	ReasoningTokens int64 `json:"reasoning_tokens"`
	// CostUSD is what the provider charged, in OpenRouter credits (1 credit = 1 USD). Absent when no call reported a cost.
	CostUSD *float64 `json:"cost_usd,omitempty"`
	Calls   int64    `json:"calls"`
}

type InferenceThread struct {
	ID          uuid.UUID `json:"id"`
	AssistantID string    `json:"assistant_id"`
	Persistence string    `json:"persistence"`
	ContextType string    `json:"context_type,omitempty"`
	ContextID   string    `json:"context_id,omitempty"`
	Title       string    `json:"title"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
type InferenceThreadResponse struct {
	Thread   InferenceThread    `json:"thread"`
	Messages []InferenceMessage `json:"messages"`
	// Usage covers the whole chat since it was last cleared, including calls whose messages are not shown.
	Usage InferenceUsage `json:"usage"`
}
type InferenceThreadsResponse struct {
	Threads []InferenceThread `json:"threads"`
}

type InferenceClientCapability struct {
	ID            string `json:"id"`
	Version       int    `json:"version"`
	ScopeType     string `json:"scope_type,omitempty"`
	ScopeID       string `json:"scope_id,omitempty"`
	StateRevision *int64 `json:"state_revision,omitempty"`
}

type InferenceClient struct {
	SessionID    string                      `json:"session_id"`
	Capabilities []InferenceClientCapability `json:"capabilities"`
}

type InferenceClientToolResultRequest struct {
	ClientSessionID   string          `json:"client_session_id"`
	CapabilityID      string          `json:"capability_id"`
	CapabilityVersion int             `json:"capability_version"`
	ScopeType         string          `json:"scope_type,omitempty"`
	ScopeID           string          `json:"scope_id,omitempty"`
	StateRevision     *int64          `json:"state_revision,omitempty"`
	Status            string          `json:"status"`
	Result            json.RawMessage `json:"result,omitempty"`
	// UsageEvents asks for a USAGE event after each model call. Older clients reject unknown events, so it is opt-in.
	UsageEvents bool `json:"usage_events,omitempty"`
}

type InferenceDebugPreviewRequest struct {
	AssistantID string           `json:"assistant_id"`
	ThreadID    *uuid.UUID       `json:"thread_id,omitempty"`
	Instance    string           `json:"instance,omitempty"`
	Model       string           `json:"model"`
	Client      *InferenceClient `json:"client,omitempty"`
}

type InferenceRunRequest struct {
	RunID        string             `json:"run_id"`
	Debug        bool               `json:"debug,omitempty"`
	ConnectionID uuid.UUID          `json:"connection_id"`
	Model        string             `json:"model"`
	AssistantID  string             `json:"assistant_id"`
	ThreadID     *uuid.UUID         `json:"thread_id,omitempty"`
	Instance     string             `json:"instance,omitempty"`
	Client       *InferenceClient   `json:"client,omitempty"`
	Messages     []InferenceMessage `json:"messages,omitempty"`
	Message      *InferenceMessage  `json:"message,omitempty"`
	// UsageEvents asks for a USAGE event after each model call. Older clients reject unknown events, so it is opt-in.
	UsageEvents bool `json:"usage_events,omitempty"`
}
