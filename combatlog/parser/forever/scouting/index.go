package scouting

import (
	"math"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// Scouting indexes independent, already decoded source snapshots by normalized
// player identity. It owns its data; callers cannot mutate the index through
// constructor inputs or returned observations. The zero value is empty.
type Scouting struct {
	players map[guid.GUID][]Player
	ids     []guid.GUID
}

// PlayerSnapshot separates sighting freshness from known-field freshness. Name
// is an insertion label: when there are no named observations, it falls back to
// the first source's nonempty player name without inventing an observation time.
type PlayerSnapshot struct {
	// RealmCandidates contains every distinct source scalar, including empty
	// when a source is unknown. No timestamp or source ordering proves which
	// conflicting realm is authoritative; persistence must resolve or reject all.
	RealmCandidates []string
	Name            string
	LastSeen        int64
	Known           KnownFields
}

// New preserves supplied source order. Within a source, raw GUID keys are sorted
// so legacy/modern aliases resolve deterministically. Deltas remain independent.
func New(sources []Source) (*Scouting, error) {
	s := &Scouting{players: make(map[guid.GUID][]Player)}
	for _, source := range sources {
		keys := make([]string, 0, len(source.Players))
		for key := range source.Players {
			keys = append(keys, key)
		}
		slices.Sort(keys)
		for _, key := range keys {
			id, err := NormalizeGUID(key)
			if err != nil {
				return nil, err
			}
			player := source.Players[key]
			player.Gender = cloneValue(player.Gender)
			player.Observations = slices.Clone(player.Observations)
			for i := range player.Observations {
				player.Observations[i] = cloneObservation(player.Observations[i])
			}
			s.players[id] = append(s.players[id], player)
		}
	}
	for id := range s.players {
		s.ids = append(s.ids, id)
	}
	slices.Sort(s.ids)
	return s, nil
}

func (s *Scouting) Len() int {
	if s == nil {
		return 0
	}
	return len(s.ids)
}

// PlayerIDs returns a private copy in ascending normalized GUID order.
func (s *Scouting) PlayerIDs() []guid.GUID {
	if s == nil {
		return nil
	}
	return slices.Clone(s.ids)
}

// KnownAt merges only resolved known fields at or before at. Equal timestamps
// retain the first source; within each source, the last known encoded row wins.
func (s *Scouting) KnownAt(id guid.GUID, at int64) KnownFields {
	var known KnownFields
	if s == nil {
		return known
	}
	newer := func(old, next *Observation) *Observation {
		if next != nil && (old == nil || next.At > old.At) {
			return next
		}
		return old
	}
	for _, player := range s.players[id] {
		next := player.KnownAt(at)
		known.Name = newer(known.Name, next.Name)
		known.Level = newer(known.Level, next.Level)
		known.Guild = newer(known.Guild, next.Guild)
		known.Party = newer(known.Party, next.Party)
	}
	return KnownFields{Name: cloneObservationPointer(known.Name), Level: cloneObservationPointer(known.Level), Guild: cloneObservationPointer(known.Guild), Party: cloneObservationPointer(known.Party)}
}

func (s *Scouting) Latest(id guid.GUID) (PlayerSnapshot, bool) {
	if s == nil {
		return PlayerSnapshot{}, false
	}
	players, ok := s.players[id]
	if !ok {
		return PlayerSnapshot{}, false
	}
	snapshot := PlayerSnapshot{Known: s.KnownAt(id, math.MaxInt64)}
	realms := make(map[string]struct{})
	for _, player := range players {
		realms[player.Realm] = struct{}{}
		snapshot.LastSeen = max(snapshot.LastSeen, player.LastSeen)
		for _, observation := range player.Observations {
			snapshot.LastSeen = max(snapshot.LastSeen, observation.At)
		}
		if snapshot.Name == "" {
			snapshot.Name = player.Name
		}
	}
	if snapshot.Known.Name != nil {
		snapshot.Name = snapshot.Known.Name.Name
	}
	for realm := range realms {
		snapshot.RealmCandidates = append(snapshot.RealmCandidates, realm)
	}
	slices.Sort(snapshot.RealmCandidates)
	return snapshot, true
}

func cloneValue[T any](value *T) *T {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
func cloneObservation(value Observation) Observation {
	value.Level = cloneValue(value.Level)
	value.Guild = cloneValue(value.Guild)
	value.Party = cloneValue(value.Party)
	value.Race = cloneValue(value.Race)
	value.Gender = cloneValue(value.Gender)
	return value
}
func cloneObservationPointer(value *Observation) *Observation {
	if value == nil {
		return nil
	}
	copy := cloneObservation(*value)
	return &copy
}
