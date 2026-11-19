package chroniclebot

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

const unknownUnitDebounceWindow = 72 * time.Hour
const unknownUnitDebounceCapacity = 4096

type unknownUnitZoneKey struct {
	tenant uuid.UUID
	zone   string
}

type unknownUnitZoneReservation struct {
	pending bool
	until   time.Time
}

// Bot-owned, process-local throttling only: restarts and other replicas have
// independent windows. mu is never nested with another lock or held across I/O.
// At capacity we suppress new zones rather than evict unexpired reservations.
type unknownUnitDebounce struct {
	mu      sync.Mutex
	entries map[unknownUnitZoneKey]unknownUnitZoneReservation
	now     func() time.Time // Optional deterministic clock, set before concurrent use.
}

func (d *unknownUnitDebounce) clock() time.Time {
	if d.now != nil {
		return d.now()
	}
	return time.Now()
}

func (d *unknownUnitDebounce) reserve(tenant uuid.UUID, zones []UnknownUnitZoneSummary) ([]UnknownUnitZoneSummary, func(bool)) {
	now := d.clock()
	d.mu.Lock()
	if d.entries == nil {
		d.entries = make(map[unknownUnitZoneKey]unknownUnitZoneReservation)
	}
	for key, entry := range d.entries {
		if !entry.pending && !now.Before(entry.until) {
			delete(d.entries, key)
		}
	}
	selected := make([]UnknownUnitZoneSummary, 0, len(zones))
	keys := make([]unknownUnitZoneKey, 0, len(zones))
	for _, zone := range zones {
		key := unknownUnitZoneKey{tenant: tenant, zone: zone.Zone}
		if _, exists := d.entries[key]; exists || len(d.entries) >= unknownUnitDebounceCapacity {
			continue
		}
		d.entries[key] = unknownUnitZoneReservation{pending: true}
		selected = append(selected, zone)
		keys = append(keys, key)
	}
	d.mu.Unlock()
	return selected, func(success bool) {
		until := d.clock().Add(unknownUnitDebounceWindow)
		d.mu.Lock()
		defer d.mu.Unlock()
		for _, key := range keys {
			if success {
				d.entries[key] = unknownUnitZoneReservation{until: until}
			} else {
				delete(d.entries, key)
			}
		}
	}
}
