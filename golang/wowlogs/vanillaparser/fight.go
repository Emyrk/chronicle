package vanillaparser

import (
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
)

var (
	ParticipantTimeout = 5 * time.Minute
)

// Fight identifies a start and end of combat.
type Fight struct {
	// Participants is a map of all participants in the fight.
	// Both player and non-player. The time.Time is their last seen time.
	Participants         map[guid.GUID]time.Time
	ParticipantFirstSeen map[guid.GUID]time.Time

	FriendlyAlive map[guid.GUID]struct{}
	EnemiesAlive  map[guid.GUID]struct{}

	DamageDone  map[guid.GUID]int64
	DamageTaken map[guid.GUID]int64

	Zone zone.Zone

	Started      time.Time
	Ended        time.Time
	LastActivity time.Time
}

func NewFight(ts time.Time, zone zone.Zone) *Fight {
	f := &Fight{
		Participants:         make(map[guid.GUID]time.Time),
		ParticipantFirstSeen: make(map[guid.GUID]time.Time),
		FriendlyAlive:        make(map[guid.GUID]struct{}),
		EnemiesAlive:         make(map[guid.GUID]struct{}),
		DamageDone:           make(map[guid.GUID]int64),
		DamageTaken:          make(map[guid.GUID]int64),
		Zone:                 zone,
		Started:              ts,
		Ended:                time.Time{},
	}
	return f
}

func (f *Fight) SeenParticipants(ts time.Time, gs ...guid.GUID) {
	f.bump(ts)
	for _, id := range gs {
		// TODO: What about summoned things? Allied NPCs?
		if id.IsPlayer() && id.IsPet() {
			f.FriendlyAlive[id] = struct{}{}
		} else {
			f.EnemiesAlive[id] = struct{}{}
		}
		f.Participants[id] = ts
		if _, ok := f.ParticipantFirstSeen[id]; !ok {
			f.ParticipantFirstSeen[id] = ts
		}
	}
}

// TODO: Track the ts
func (f *Fight) Slain(ts time.Time, gs ...guid.GUID) {
	f.bump(ts)
	for _, id := range gs {
		delete(f.FriendlyAlive, id)
		delete(f.EnemiesAlive, id)
	}

	if len(f.EnemiesAlive) == 0 {
		f.FinishFight(ts)
	}
}

func (f *Fight) bump(ts time.Time) {
	f.LastActivity = ts
}

func (f *Fight) FinishFight(ts time.Time) {
	if f.IsDone() {
		return
	}
	f.Ended = ts
}

func (f *Fight) IsDone() bool {
	return !f.Ended.IsZero()
}

func (f *Fight) Timeout(now time.Time) {
	for id, ts := range f.Participants {
		if now.Sub(ts) > ParticipantTimeout {
			// Treat them as slain I guess?
			f.Slain(ts, id)
		}
	}
}

func (f *Fight) CheckDone(now time.Time) {
	f.Timeout(now)
	if len(f.EnemiesAlive) == 0 || now.Sub(f.LastActivity) > ParticipantTimeout {
		f.FinishFight(now)
	}
}
