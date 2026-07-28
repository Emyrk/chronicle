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
	LinkedAt      time.Time  `json:"linked_at"`
}

// CharacterLinkInfo describes who a character is linked to (admin view).
type CharacterLinkInfo struct {
	UserID        uuid.UUID  `json:"user_id"`
	Username      string     `json:"username"`
	CharacterGUID GUIDString `json:"character_guid"`
	RealmID       uuid.UUID  `json:"realm_id"`
	LinkedAt      time.Time  `json:"linked_at"`
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
