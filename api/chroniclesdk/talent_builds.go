package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// UserTalentBuild is a saved talent calculator build owned by a user.
type UserTalentBuild struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	ClassID int32     `json:"class_id"`
	// Build is the positional WoWHead-style build string, e.g. "35003-05032".
	Build     string    `json:"build"`
	Locked    bool      `json:"locked"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ListUserTalentBuildsResponse struct {
	Builds []UserTalentBuild `json:"builds"`
	// Limit is the maximum number of builds a user may save (per tenant).
	Limit int `json:"limit"`
}

type CreateUserTalentBuildRequest struct {
	Name    string `json:"name"`
	ClassID int32  `json:"class_id"`
	Build   string `json:"build"`
	Locked  bool   `json:"locked"`
}

type UpdateUserTalentBuildRequest struct {
	Name   *string `json:"name,omitempty"`
	Build  *string `json:"build,omitempty"`
	Locked *bool   `json:"locked,omitempty"`
}
