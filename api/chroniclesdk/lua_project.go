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

// CreateLuaProjectReleaseRequest tags the current main as a release.
type CreateLuaProjectReleaseRequest struct {
	Tag              string `json:"tag"`
	ExpectedRevision int64  `json:"expected_revision"`
}

// LuaProjectMain is the addon's latest saved source. Anyone who can view the addon can run it.
type LuaProjectMain struct {
	SHA256    string    `json:"sha256"`
	Icon      string    `json:"icon,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LuaProjectRelease is a tagged snapshot of main. Only the newest few keep their files; older ones stay
// listed with no SHA256 and Available false.
type LuaProjectRelease struct {
	Tag         string     `json:"tag"`
	SHA256      string     `json:"sha256,omitempty"`
	Available   bool       `json:"available"`
	Icon        string     `json:"icon,omitempty"`
	PublishedAt time.Time  `json:"published_at"`
	PublishedBy *uuid.UUID `json:"published_by,omitempty"`
}

type LuaProject struct {
	ID       uuid.UUID `json:"id"`
	OwnerID  uuid.UUID `json:"owner_id"`
	Kind     string    `json:"kind"`
	Name     string    `json:"name"`
	Slug     string    `json:"slug"`
	Revision int64     `json:"revision"`
	// Author is the owner's addon author name, the first part of /addons/<author>/<slug>. Absent until claimed.
	Author string          `json:"author,omitempty"`
	Main   *LuaProjectMain `json:"main,omitempty"`
	// Releases are newest first. Panels run the newest one that is still available.
	Releases  []LuaProjectRelease `json:"releases"`
	CreatedAt time.Time           `json:"created_at"`
	UpdatedAt time.Time           `json:"updated_at"`
}

// LuaProjectPermissions are what the viewing user may do with an addon.
type LuaProjectPermissions struct {
	View    bool `json:"view"`
	Use     bool `json:"use"`
	Edit    bool `json:"edit"`
	Release bool `json:"release"`
	Manage  bool `json:"manage"`
}

// LuaProjectPage is an addon with what the viewing user may do with it.
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
	// Permissions are any of "edit" and "release".
	Permissions []string  `json:"permissions"`
	AddedAt     time.Time `json:"added_at"`
}

type PutLuaProjectContributorRequest struct {
	Permissions []string `json:"permissions"`
}
