package instancesearch

import "github.com/Emyrk/chronicle/internal/ratelimit"

const RateLimitBucketName = "instance_search"

// UserRateLimit is shared by HTTP and non-HTTP instance-search callers so one
// Chronicle user draws from the same database-backed bucket everywhere.
func UserRateLimit() ratelimit.Limit {
	return ratelimit.PerMinute(120, 300)
}
