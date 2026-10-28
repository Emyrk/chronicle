package chroniclesdk

// DiscoveryEntry is one server/tenant in the discovery response.
type DiscoveryEntry struct {
	// Branding for this server/tenant.
	Branding *Branding `json:"branding"`
	// URL is the canonical URL for this server/tenant's Chronicle deployment.
	URL string `json:"url"`
	// Instances14d is the number of instances uploaded in the last 14 days.
	Instances14d *int64 `json:"instances_14d,omitempty"`
	// UniquePlayers14d is the number of distinct players across instances in the last 14 days.
	UniquePlayers14d *int64 `json:"unique_players_14d,omitempty"`
	// Current is true for the server/tenant that served this request.
	Current bool `json:"current,omitempty"`
}
