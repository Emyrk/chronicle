package chroniclesdk

import "time"

// WoWLogsSettings describes the caller's wow-logs forwarding opt-in. The
// stored token is write-only and never returned.
type WoWLogsSettings struct {
	// Available is false when the deployment cannot store tokens.
	Available bool `json:"available"`
	// TokenSet is true when the user saved a token and is opted in.
	TokenSet       bool       `json:"token_set"`
	TokenUpdatedAt *time.Time `json:"token_updated_at,omitempty"`
}

// SetWoWLogsTokenRequest saves the caller's own wow-logs API token.
type SetWoWLogsTokenRequest struct {
	Token string `json:"token"`
}
