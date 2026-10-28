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
	ID       uuid.UUID `json:"id"`
	OwnerID  uuid.UUID `json:"owner_id"`
	Kind     string    `json:"kind"`
	Name     string    `json:"name"`
	Slug     string    `json:"slug"`
	Revision int64     `json:"revision"`
	// Author is the owner's addon author name, the first part of /addons/<author>/<slug>. Absent until claimed.
	Author      string             `json:"author,omitempty"`
	DraftSHA256 string             `json:"draft_sha256,omitempty"`
	DraftIcon   string             `json:"draft_icon,omitempty"`
	Unstable    *LuaProjectChannel `json:"unstable,omitempty"`
	Stable      *LuaProjectChannel `json:"stable,omitempty"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
}

// LuaProjectPermissions are what the viewing user may do with an addon.
type LuaProjectPermissions struct {
	View            bool `json:"view"`
	Use             bool `json:"use"`
	Edit            bool `json:"edit"`
	PublishUnstable bool `json:"publish_unstable"`
	Publish         bool `json:"publish"`
	Manage          bool `json:"manage"`
}

// LuaProjectPage is an addon as the viewing user may see it: the draft and unstable release only with edit.
type LuaProjectPage struct {
	Project     LuaProject            `json:"project"`
	Permissions LuaProjectPermissions `json:"permissions"`
}

type AddonAuthor struct {
	Name string `json:"name"`
}

type ClaimAddonAuthorRequest struct {
	Name string `json:"name"`
}

// LuaProjectContributor is someone the owner shared an addon with.
type LuaProjectContributor struct {
	UserID uuid.UUID `json:"user_id"`
	// Author is their addon author name; Username is their display name.
	Author   string `json:"author,omitempty"`
	Username string `json:"username"`
	// Permissions are any of "edit", "publish_unstable" and "publish".
	Permissions []string  `json:"permissions"`
	AddedAt     time.Time `json:"added_at"`
}

type PutLuaProjectContributorRequest struct {
	Permissions []string `json:"permissions"`
}
