package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

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
}
type InferenceThreadsResponse struct {
	Threads []InferenceThread `json:"threads"`
}

type InferenceRunRequest struct {
	RunID        string             `json:"run_id"`
	ConnectionID uuid.UUID          `json:"connection_id"`
	Model        string             `json:"model"`
	AssistantID  string             `json:"assistant_id"`
	ThreadID     *uuid.UUID         `json:"thread_id,omitempty"`
	Instance     string             `json:"instance,omitempty"`
	Messages     []InferenceMessage `json:"messages,omitempty"`
	Message      *InferenceMessage  `json:"message,omitempty"`
}
