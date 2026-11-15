package servicestats

import "time"

// A tenant gets /stats pages only when it clears either activity threshold
// within ActivityWindow. Below both, every /stats URL returns 404 and the job
// drops the tenant's page snapshots. Per-page minimum samples are on Page.
const (
	// MinTenantRaids is the listed-raid count (logical runs) that qualifies a
	// tenant.
	MinTenantRaids = 50
	// MinTenantPlayers is the distinct-player count that qualifies a tenant.
	MinTenantPlayers = 200
	// ActivityWindow is how far back the threshold counts.
	ActivityWindow = 180 * 24 * time.Hour
	// ActivityCadence is how often the job re-checks a tenant's threshold.
	ActivityCadence = 6 * time.Hour
)

// DispatchInterval is how often the job checks every tenant for due
// snapshots. Producer cadences are effectively rounded up to it.
const DispatchInterval = time.Hour

// Response caching for /stats pages: browsers keep a page for five minutes,
// the edge (Cloudflare) for an hour.
const (
	BrowserMaxAge = 5 * time.Minute
	EdgeMaxAge    = time.Hour
)
