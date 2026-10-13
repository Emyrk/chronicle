package chroniclesdk

import "github.com/google/uuid"

// CreateLiveSessionRequest starts an ephemeral live session for an instance.
type CreateLiveSessionRequest struct {
	InstanceID uuid.UUID `json:"instance_id"`
	Password   string    `json:"password,omitempty"`
}

// CreateLiveSessionResponse contains the leader credentials for a live session.
type CreateLiveSessionResponse struct {
	Code        string `json:"code"`
	LeaderToken string `json:"leader_token"`
	URL         string `json:"url"`
}

// JoinLiveSessionRequest contains the optional password for a live session.
type JoinLiveSessionRequest struct {
	Password string `json:"password,omitempty"`
}

// JoinLiveSessionResponse contains the guest credentials for a live session.
type JoinLiveSessionResponse struct {
	ParticipantToken string    `json:"participant_token"`
	InstanceID       uuid.UUID `json:"instance_id"`
}
