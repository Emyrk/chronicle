package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// LinkedCharacter is an in-game character linked to a user account.
type LinkedCharacter struct {
	LinkID        uuid.UUID  `json:"link_id"`
	UserID        uuid.UUID  `json:"user_id"`
	CharacterGUID GUIDString `json:"character_guid"`
	RealmID       uuid.UUID  `json:"realm_id"`
	RealmName     string     `json:"realm_name"`
	Name          string     `json:"name"`
	Class         string     `json:"class"`
	Race          string     `json:"race"`
	Gender        string     `json:"gender"`
	Level         int32      `json:"level"`
	GuildName     string     `json:"guild_name,omitempty"`
	IsPrimary     bool       `json:"is_primary"`
	// LinkSource is where the link came from: "manual" or an external
	// provider source such as "zug-zug/<url>".
	LinkSource string    `json:"link_source"`
	LinkedAt   time.Time `json:"linked_at"`
}

// CharacterLinkInfo describes who a character is linked to (admin view).
type CharacterLinkInfo struct {
	UserID        uuid.UUID  `json:"user_id"`
	Username      string     `json:"username"`
	CharacterGUID GUIDString `json:"character_guid"`
	RealmID       uuid.UUID  `json:"realm_id"`
	LinkedAt      time.Time  `json:"linked_at"`
}

// ExternalSyncResponse reports the outcome of syncing character links from
// an external verification provider. The most recent response is cached
// per user so the UI can keep showing why characters failed to link.
type ExternalSyncResponse struct {
	// SyncedAt is when this sync ran.
	SyncedAt time.Time `json:"synced_at"`
	// Verified is false when the provider does not recognize the user's
	// Discord identity as verified.
	Verified bool `json:"verified"`
	// Linked are the character links created by this sync.
	Linked []LinkedCharacter `json:"linked"`
	// Conflicts are character names that are already linked to a different
	// account and require support intervention.
	Conflicts []string `json:"conflicts"`
	// Unmatched are character names the provider returned that Chronicle has
	// never seen in a combat log, so they cannot be linked yet.
	Unmatched []string `json:"unmatched"`
}

// LinkCharacterRequest links a character to a user account (admin only).
type LinkCharacterRequest struct {
	RealmID       uuid.UUID  `json:"realm_id"`
	CharacterGUID GUIDString `json:"character_guid"`
}

// SetPrimaryCharacterRequest marks one of the user's linked characters as
// their primary ("main") character.
type SetPrimaryCharacterRequest struct {
	RealmID       uuid.UUID  `json:"realm_id"`
	CharacterGUID GUIDString `json:"character_guid"`
}
