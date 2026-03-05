package api

import (
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

type recentRaidsCache struct {
	mu      sync.RWMutex
	entries map[string]chroniclesdk.RecentInstancesResponse
	epoch   time.Time
	ttl     time.Duration
}

func newRecentRaidsCache(ttl time.Duration) *recentRaidsCache {
	return &recentRaidsCache{
		entries: make(map[string]chroniclesdk.RecentInstancesResponse),
		epoch:   time.Now(),
		ttl:     ttl,
	}
}

func (c *recentRaidsCache) Get(key string) (chroniclesdk.RecentInstancesResponse, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if time.Since(c.epoch) >= c.ttl {
		return chroniclesdk.RecentInstancesResponse{}, false
	}

	resp, ok := c.entries[key]
	return resp, ok
}

func (c *recentRaidsCache) Set(key string, resp chroniclesdk.RecentInstancesResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if time.Since(c.epoch) >= c.ttl {
		c.entries = make(map[string]chroniclesdk.RecentInstancesResponse)
		c.epoch = time.Now()
	}

	c.entries[key] = resp
}
