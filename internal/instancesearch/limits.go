package instancesearch

import "github.com/Emyrk/chronicle/internal/ratelimit"

const (
	RateLimitBucketName = "instance_search"
	userRefillPerMinute = 60
	freeBurst           = 100
	honoredBurst        = 300
	reveredBurst        = 800
	exaltedBurst        = 2000
)

// UserRateLimit returns the tier-aware limit shared by HTTP and non-HTTP
// instance-search callers so one Chronicle user draws from the same bucket.
func UserRateLimit(exalted, revered, honored bool) ratelimit.Limit {
	burst := float64(freeBurst)
	switch {
	case exalted:
		burst = exaltedBurst
	case revered:
		burst = reveredBurst
	case honored:
		burst = honoredBurst
	}
	return ratelimit.PerMinute(userRefillPerMinute, burst)
}
