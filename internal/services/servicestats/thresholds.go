package servicestats

import "time"

// Tenant activity threshold, counted over ActivityWindow. A tenant gets /stats
// pages once it reaches MinTenantRaids or MinTenantPlayers, and keeps them
// until it falls below both Keep* values (hysteresis, so a tenant hovering
// near the line doesn't flip between 200 and 404). Without pages every /stats
// URL is 404. Per-page minimum samples are on Output.MinSample.
const (
	// MinTenantRaids is the listed-raid count (logical runs) that qualifies
	// a tenant.
	MinTenantRaids = 50
	// MinTenantPlayers is the distinct-player count that qualifies a tenant.
	MinTenantPlayers = 200
	// KeepTenantRaids keeps an already qualified tenant's pages.
	KeepTenantRaids = 40
	// KeepTenantPlayers keeps an already qualified tenant's pages.
	KeepTenantPlayers = 160
	// ActivityWindow is how far back the threshold counts.
	ActivityWindow = 180 * 24 * time.Hour
	// ActivityCadence is how often the job re-checks a tenant's threshold.
	ActivityCadence = 6 * time.Hour
)

// DispatchInterval is how often the job checks every tenant for due
// families. Producer cadences are effectively rounded up to it.
const DispatchInterval = time.Hour

// DefaultProducerTimeout bounds a producer whose Timeout is zero.
const DefaultProducerTimeout = 2 * time.Minute

// UnregisteredRetention is how long snapshots of a family that is no longer
// registered are kept, so a rolling deploy or a rollback still has them.
const UnregisteredRetention = 7 * 24 * time.Hour

// Response caching for /stats pages: browsers keep a page for five minutes,
// the edge (Cloudflare) for an hour.
const (
	BrowserMaxAge = 5 * time.Minute
	EdgeMaxAge    = time.Hour
)
