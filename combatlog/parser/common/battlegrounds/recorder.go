package battlegrounds

import (
	"errors"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// Recording is an observation episode, not a PvE encounter or a complete match.
// PayloadID is the UUID key in every stream header. Events are uncompressed and
// read-only: callers must copy byte slices before modifying them.
type Recording struct {
	Episode   Episode
	PayloadID uuid.UUID
	Events    encounterevents.Events
}

// Recorder synchronously snapshots attributed messages into protobuf streams.
// Like State, it is single-consumer and must not be used concurrently.
type Recorder struct {
	state      *State
	collector  *encounterevents.EncounterEventsInProgress
	episodeID  uint64
	payloadID  uuid.UUID
	recordings []Recording
	finished   bool
	err        error
}

func NewRecorder(format database.LogFormat, classifier func(uint32) bool) (*Recorder, error) {
	r := &Recorder{}
	s, err := New(format, classifier, r.consume)
	if err != nil {
		return nil, err
	}
	r.state = s
	return r, nil
}

func (r *Recorder) consume(id uint64, m messages.Message) error {
	if r.collector == nil || r.episodeID != id {
		if err := r.finalize(); err != nil {
			return err
		}
		r.collector = encounterevents.New(true) // Never reset shared message activity.
		// Disable deferred damage encoding while empty. All subsequent writes must
		// snapshot immediately, before other consumers can mutate nested message data.
		if err := r.collector.Damage.SerializeBuffered(nil); err != nil {
			return err
		}
		r.episodeID, r.payloadID = id, uuid.New()
	}
	// The first attributed message is the opening Zone, anchoring every stream
	// (including empty streams) at the episode's FirstObservedAt.
	return r.collector.Process(m)
}

func (r *Recorder) finalize() error {
	if r.collector == nil {
		return nil
	}
	var events encounterevents.Events
	if err := r.collector.Finalize(&events, r.payloadID); err != nil {
		return err
	}
	r.recordings = append(r.recordings, Recording{
		Episode: r.state.episodes[r.episodeID-1], PayloadID: r.payloadID, Events: events,
	})
	r.collector = nil
	return nil
}

// Process expects timestamp-reordered normalized messages. Call Finish only after
// draining the reorder buffer's EOF tail, not when the raw parser reaches EOF.
func (r *Recorder) Process(m messages.Message) error {
	if r.err != nil {
		return r.err
	}
	if r.finished {
		return errors.New("battlegrounds: process after finish")
	}
	r.err = r.state.Process(m)
	// A departing non-BG Zone never reaches consume, but still closes its collector.
	if r.err == nil && !r.state.active {
		r.err = r.finalize()
	}
	return r.err
}

// Finish must be called only after the parser/reorder EOF tail is drained. It is
// idempotent; errors are terminal and never expose partial recordings as success.
func (r *Recorder) Finish() error {
	if r.err != nil {
		return r.err
	}
	if r.finished {
		return nil
	}
	r.err = r.state.Finish()
	if r.err == nil {
		r.err = r.finalize()
	}
	if r.err == nil {
		r.finished = true
	}
	return r.err
}

// Recordings returns finished results only. The slice and metadata are detached;
// payload bytes are read-only and remain stable for the lifetime of the recorder.
func (r *Recorder) Recordings() ([]Recording, error) {
	if r.err != nil {
		return nil, r.err
	}
	if !r.finished {
		return nil, errors.New("battlegrounds: recordings requested before finish")
	}
	return slices.Clone(r.recordings), nil
}
