package chroniclesdk

import "github.com/google/uuid"

type SearchSuggestionPlayer struct {
	ID        GUIDString `json:"id"`
	Name      string     `json:"name"`
	Class     string     `json:"class"`
	RealmID   uuid.UUID  `json:"realm_id"`
	RealmName string     `json:"realm_name"`
}

type SearchSuggestionGuild struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	RealmID   uuid.UUID `json:"realm_id"`
	RealmName string    `json:"realm_name"`
}

type SearchSuggestionsResponse struct {
	Players []SearchSuggestionPlayer `json:"players"`
	Guilds  []SearchSuggestionGuild  `json:"guilds"`
}
