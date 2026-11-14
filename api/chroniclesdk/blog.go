package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

type BlogVoteRequest struct {
	Vote int16 `json:"vote"`
}
type BlogFeedbackRequest struct {
	Body    string `json:"body"`
	Consent bool   `json:"consent"`
}

// BlogPublicFeedback deliberately has no account or tenant identifiers.
type BlogPublicFeedback struct {
	ID             uuid.UUID `json:"id"`
	Body           string    `json:"body"`
	ServerRelation string    `json:"server_relation"`
}
type BlogOwnFeedback struct {
	ID      uuid.UUID `json:"id"`
	Body    string    `json:"body"`
	Status  string    `json:"status"`
	Deleted bool      `json:"deleted"`
}
type BlogInteractions struct {
	VotingEnabled   bool                 `json:"voting_enabled"`
	FeedbackEnabled bool                 `json:"feedback_enabled"`
	Enabled         bool                 `json:"enabled"`
	UpVotes         int64                `json:"up_votes"`
	OwnVote         int16                `json:"own_vote"`
	Feedback        []BlogPublicFeedback `json:"feedback"`
	OwnFeedback     *BlogOwnFeedback     `json:"own_feedback,omitempty"`
	FeedbackBanned  bool                 `json:"feedback_banned"`
}
type BlogModerationRequest struct {
	ExpectedUpdatedAt time.Time `json:"expected_updated_at"`
}
type BlogAdminFeedback struct {
	UpdatedAt time.Time `json:"updated_at"`
	ID        uuid.UUID `json:"id"`
	PostSlug  string    `json:"post_slug"`
	UserID    uuid.UUID `json:"user_id"`
	TenantID  uuid.UUID `json:"tenant_id"`
	Body      string    `json:"body"`
	Status    string    `json:"status"`
	Consent   bool      `json:"consent"`
	Deleted   bool      `json:"deleted"`
}
type BlogAdminVotes struct {
	UpVotes   int64 `json:"up_votes"`
	DownVotes int64 `json:"down_votes"`
}
