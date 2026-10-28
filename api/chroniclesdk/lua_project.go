package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

type CreateLuaProjectRequest struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type LuaProjectPublishRequest struct {
	ExpectedRevision int64  `json:"expected_revision"`
	TestedSHA256     string `json:"tested_sha256,omitempty"`
}

type LuaProjectChannel struct {
	SHA256      string    `json:"sha256"`
	PublishedAt time.Time `json:"published_at"`
	PublishedBy uuid.UUID `json:"published_by"`
	// Icon is the release's project.json "icon", absent when it named none.
	Icon string `json:"icon,omitempty"`
}

type LuaProject struct {
	ID          uuid.UUID          `json:"id"`
	OwnerID     uuid.UUID          `json:"owner_id"`
	Kind        string             `json:"kind"`
	Name        string             `json:"name"`
	Slug        string             `json:"slug"`
	Revision    int64              `json:"revision"`
	DraftSHA256 string             `json:"draft_sha256,omitempty"`
	DraftIcon   string             `json:"draft_icon,omitempty"`
	Unstable    *LuaProjectChannel `json:"unstable,omitempty"`
	Stable      *LuaProjectChannel `json:"stable,omitempty"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
}
