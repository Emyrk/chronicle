package chroniclesdk

import "github.com/google/uuid"

type UserFavoritesResponse struct {
	Guilds  []FavoriteGuild  `json:"guilds"`
	Players []FavoritePlayer `json:"players"`
}

type FavoriteGuild struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	RealmID   uuid.UUID `json:"realm_id"`
	RealmName string    `json:"realm_name"`
}

type FavoritePlayer struct {
	ID        GUIDString `json:"id"`
	RealmID   uuid.UUID  `json:"realm_id"`
	RealmName string     `json:"realm_name"`
	Name      string     `json:"name"`
	Class     string     `json:"class"`
	Race      string     `json:"race"`
	Gender    string     `json:"gender"`
	Level     int32      `json:"level"`
	GuildID   *uuid.UUID `json:"guild_id,omitempty"`
	GuildName string     `json:"guild_name,omitempty"`
}
