package battlegrounds

import (
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database"
)

// CloseReason describes the end of observation, never a match result.
type CloseReason string

const (
	CloseZoneChange CloseReason = "zone_change"
	CloseEOF        CloseReason = "eof"
)

// Episode contains only lifecycle metadata. ID is sequential and local to State.
type Episode struct {
	ID              uint64
	MapID           uint32
	FirstObservedAt time.Time
	// LastObservedAt is the latest timestamp attributed to this episode. The
	// departing zone message is not attributed to the episode it closes.
	LastObservedAt time.Time
	// ExitAt is populated only by a zone transition, not by EOF.
	ExitAt      time.Time
	CloseReason CloseReason
}

// EventSink receives each attributed message synchronously, including the entry
// zone and repeated same-map zones, but excluding the departing zone. It must
// not reenter State. Copy any message data retained beyond the callback: upstream
// consumers may mutate messages. A nil sink permits metadata-only consumption.
type EventSink func(episodeID uint64, m messages.Message) error

// State tracks metadata without retaining combat messages.
type State struct {
	isBattleground func(mapID uint32) bool
	sink           EventSink
	episodes       []Episode
	active         bool
	finished       bool
	err            error
}

// New requires v22 and an explicit map classifier. There is no default allowlist.
func New(format database.LogFormat, isBattleground func(uint32) bool, sink EventSink) (*State, error) {
	if format != database.LogFormatV22Cleu {
		return nil, fmt.Errorf("battlegrounds: unsupported log format %q", format)
	}
	if isBattleground == nil {
		return nil, errors.New("battlegrounds: map classifier is required")
	}
	return &State{isBattleground: isBattleground, sink: sink}, nil
}

// Episodes returns a detached snapshot, including any currently open episode.
func (s *State) Episodes() []Episode { return slices.Clone(s.episodes) }

// Process implements the parser consumer contract. Errors are sticky: unsupported
// headers or failed sinks cannot be followed by apparently successful output.
func (s *State) Process(m messages.Message) error {
	if s.err != nil {
		return s.err
	}
	if s.finished {
		return errors.New("battlegrounds: process after finish")
	}
	if v, ok := m.(*messages.Versions); ok {
		// modern.Parser preserves the raw numeric header token in combat_log.
		// Addon-only Versions messages do not override the constructor's format.
		if version, exists := v.Versions["combat_log"]; exists && version != "22" {
			s.err = fmt.Errorf("battlegrounds: unsupported combat_log version %q", version)
			return s.err
		}
	}
	if z, ok := m.(*messages.Zone); ok {
		known := s.isBattleground(z.MapID)
		if s.active && (!known || s.episodes[len(s.episodes)-1].MapID != z.MapID) {
			e := &s.episodes[len(s.episodes)-1]
			e.ExitAt = m.Date()
			e.CloseReason = CloseZoneChange
			s.active = false
		}
		if known && !s.active {
			s.episodes = append(s.episodes, Episode{ID: uint64(len(s.episodes) + 1), MapID: z.MapID, FirstObservedAt: m.Date(), LastObservedAt: m.Date()})
			s.active = true
		}
	}
	if !s.active {
		return nil
	}
	e := &s.episodes[len(s.episodes)-1]
	if m.Date().After(e.LastObservedAt) {
		e.LastObservedAt = m.Date()
	}
	if s.sink != nil {
		if err := s.sink(e.ID, m); err != nil {
			s.err = fmt.Errorf("battlegrounds: episode %d sink: %w", e.ID, err)
			return s.err
		}
	}
	return nil
}

// Finish closes observation at EOF after all buffered messages have been drained.
// It is idempotent and uses the last observation, not wall time or an invented
// exit timestamp. Further Process calls are rejected.
func (s *State) Finish() error {
	if s.err != nil {
		return s.err
	}
	if s.finished {
		return nil
	}
	if s.active {
		s.episodes[len(s.episodes)-1].CloseReason = CloseEOF
		s.active = false
	}
	s.finished = true
	return nil
}
