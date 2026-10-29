package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

// LuaProjectQuota is the caller's owned-module resource allowance.
type LuaProjectQuota struct {
	Owned int64 `json:"owned"`
	Limit int64 `json:"limit"`
}

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

// LuaProjectMain is the module's latest saved source. Anyone who can view the module can run it.
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
	// PublishedByAuthor is the publisher's module author name.
	PublishedByAuthor string `json:"published_by_author,omitempty"`
}

type LuaProject struct {
	ID       uuid.UUID `json:"id"`
	OwnerID  uuid.UUID `json:"owner_id"`
	Kind     string    `json:"kind"`
	Name     string    `json:"name"`
	Slug     string    `json:"slug"`
	Revision int64     `json:"revision"`
	// Description is a short summary, up to LuaProjectDescriptionMax characters. It lives outside the manifest.
	Description string `json:"description"`
	// Author is the owner's module author name, the first part of /modules/<author>/<slug>. Absent until claimed.
	Author string          `json:"author,omitempty"`
	Main   *LuaProjectMain `json:"main,omitempty"`
	// Releases are newest first. Panels run the newest one that is still available.
	Releases []LuaProjectRelease `json:"releases"`
	// Stars counts the people tracking the module. Starred says whether the caller is one of them.
	Stars     int64     `json:"stars"`
	Starred   bool      `json:"starred"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LuaProjectDescriptionMax is the longest description, in characters.
const LuaProjectDescriptionMax = 300

// UpdateLuaProjectRequest changes an module's settings.
type UpdateLuaProjectRequest struct {
	Description string `json:"description"`
}

// LuaProjectStar answers a star or unstar.
type LuaProjectStar struct {
	Stars   int64 `json:"stars"`
	Starred bool  `json:"starred"`
}

// LuaProjectPermissions are what the viewing user may do with an module.
type LuaProjectPermissions struct {
	View    bool `json:"view"`
	Use     bool `json:"use"`
	Edit    bool `json:"edit"`
	Release bool `json:"release"`
	Manage  bool `json:"manage"`
}

// LuaProjectPage is an module with what the viewing user may do with it.
type LuaProjectPage struct {
	Project     LuaProject            `json:"project"`
	Permissions LuaProjectPermissions `json:"permissions"`
}

// ModuleAuthorPage is /modules/<author>: the author and the modules the caller may view.
type ModuleAuthorPage struct {
	Author   string       `json:"author"`
	Projects []LuaProject `json:"projects"`
}

type ModuleAuthor struct {
	Name string `json:"name"`
}

type ClaimModuleAuthorRequest struct {
	Name string `json:"name"`
}

// LuaProjectContributor is someone the owner shared an module with.
type LuaProjectContributor struct {
	UserID uuid.UUID `json:"user_id"`
	// Author is their module author name; Username is their display name.
	Author   string `json:"author,omitempty"`
	Username string `json:"username"`
	// Permissions are any of "edit" and "release".
	Permissions []string  `json:"permissions"`
	AddedAt     time.Time `json:"added_at"`
}

type PutLuaProjectContributorRequest struct {
	Permissions []string `json:"permissions"`
}
