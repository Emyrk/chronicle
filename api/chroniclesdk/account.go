package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type AccountMergeRequest struct {
	ID              uuid.UUID  `json:"id"`
	RequesterUserID uuid.UUID  `json:"requester_user_id"`
	SourceUserID    uuid.UUID  `json:"source_user_id"`
	TargetUserID    uuid.UUID  `json:"target_user_id"`
	DiscordID       string     `json:"discord_id"`
	SourceUsername  string     `json:"source_username"`
	SourceEmail     string     `json:"source_email"`
	TargetUsername  string     `json:"target_username"`
	TargetEmail     string     `json:"target_email"`
	SourceBlockers  []string   `json:"source_blockers"`
	Status          string     `json:"status"`
	Message         string     `json:"message"`
	Response        string     `json:"response"`
	ReviewerID      *uuid.UUID `json:"reviewer_id,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	ReviewedAt      *time.Time `json:"reviewed_at,omitempty"`
}

type AccountMergeDecisionRequest struct {
	Approved bool   `json:"approved"`
	Response string `json:"response"`
}

type AccountDeletionStatus struct {
	CanDelete bool     `json:"can_delete"`
	Blockers  []string `json:"blockers"`
}

type DeleteAccountRequest struct {
	Confirmation string `json:"confirmation"`
}
