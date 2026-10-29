package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

// ProofCharacter identifies one same-realm character in a photo proof request.
type ProofCharacter struct {
	RealmID       uuid.UUID  `json:"realm_id"`
	CharacterGUID GUIDString `json:"character_guid"`
}

type ProofSubject struct {
	ProofCharacter
	GuildID   *uuid.UUID `json:"guild_id,omitempty"`
	Name      string     `json:"name"`
	RealmName string     `json:"realm_name"`
	Class     string     `json:"class,omitempty"`
	GuildName string     `json:"guild_name,omitempty"`
	Status    string     `json:"status"`
	Warning   string     `json:"warning,omitempty"`
}

type ProofRequest struct {
	ID          uuid.UUID      `json:"id"`
	ApplicantID uuid.UUID      `json:"applicant_id"`
	TenantID    uuid.UUID      `json:"tenant_id"`
	TenantName  string         `json:"tenant_name"`
	TenantSlug  string         `json:"tenant_slug,omitempty"`
	Purpose     string         `json:"purpose"`
	Status      string         `json:"status"`
	Message     string         `json:"message"`
	Response    string         `json:"response"`
	CreatedAt   time.Time      `json:"created_at"`
	ReviewedAt  *time.Time     `json:"reviewed_at,omitempty"`
	Subjects    []ProofSubject `json:"subjects"`
	// Applicant is only populated for reviewers.
	Applicant *ProofApplicant `json:"applicant,omitempty"`
}

// ProofApplicant gives reviewers context about who submitted a proof.
type ProofApplicant struct {
	Username         string            `json:"username"`
	DiscordLinked    bool              `json:"discord_linked"`
	DiscordID        string            `json:"discord_id,omitempty"`
	LinkedCharacters []LinkedCharacter `json:"linked_characters"`
}

// ProofCooldownResponse is the account's next eligible submission time for
// character-link photo proof, regardless of which tenant receives the request.
type ProofCooldownResponse struct {
	NextSubmissionAt *time.Time `json:"next_submission_at,omitempty"`
	Message          string     `json:"message,omitempty"`
}

// TenantProofGrant assigns photo-proof permissions to one user on one tenant.
type TenantProofGrant struct {
	UserID uuid.UUID `json:"user_id"`
	Submit bool      `json:"submit"`
	Review bool      `json:"review"`
}

type ProofDecision struct {
	ProofCharacter
	GuildID  *uuid.UUID `json:"guild_id,omitempty"`
	Approved bool       `json:"approved"`
}

type DecideProofRequest struct {
	Message   string          `json:"message"`
	Decisions []ProofDecision `json:"decisions"`
}
