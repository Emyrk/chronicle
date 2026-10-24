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
	Name      string `json:"name"`
	RealmName string `json:"realm_name"`
	Status    string `json:"status"`
	Warning   string `json:"warning,omitempty"`
}

type ProofRequest struct {
	ID          uuid.UUID      `json:"id"`
	ApplicantID uuid.UUID      `json:"applicant_id"`
	Purpose     string         `json:"purpose"`
	Status      string         `json:"status"`
	Message     string         `json:"message"`
	Response    string         `json:"response"`
	CreatedAt   time.Time      `json:"created_at"`
	ReviewedAt  *time.Time     `json:"reviewed_at,omitempty"`
	Subjects    []ProofSubject `json:"subjects"`
}

type ProofDecision struct {
	ProofCharacter
	Approved bool `json:"approved"`
}

type DecideProofRequest struct {
	Message   string          `json:"message"`
	Decisions []ProofDecision `json:"decisions"`
}
