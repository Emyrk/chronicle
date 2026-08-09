package vehicles

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type ReleaseReason string

const (
	ReleaseReasonExplicit        ReleaseReason = "explicit"
	ReleaseReasonReassigned      ReleaseReason = "reassigned"
	ReleaseReasonSessionBoundary ReleaseReason = "session_boundary"
)

type DiagnosticKind string

const (
	DiagnosticDuplicateAssignment DiagnosticKind = "duplicate_assignment"
	DiagnosticUnmatchedRelease    DiagnosticKind = "unmatched_release"
	DiagnosticStaleRelease        DiagnosticKind = "stale_release"
)

type ControlInterval struct {
	SessionID       string        `json:"session_id,omitempty"`
	VehicleGUID     guid.GUID     `json:"vehicle_guid"`
	ControllerGUID  guid.GUID     `json:"controller_guid"`
	VehicleName     string        `json:"vehicle_name,omitempty"`
	ControllerName  string        `json:"controller_name,omitempty"`
	AssignedAtMs    int64         `json:"assigned_at_ms"`
	ReleasedAtMs    *int64        `json:"released_at_ms,omitempty"`
	AssignedOrdinal uint64        `json:"assigned_ordinal"`
	ReleaseReason   ReleaseReason `json:"release_reason,omitempty"`
	InferredRelease bool          `json:"inferred_release,omitempty"`
}

type Diagnostic struct {
	Kind                 DiagnosticKind `json:"kind"`
	SessionID            string         `json:"session_id,omitempty"`
	TimestampMs          int64          `json:"timestamp_ms"`
	Ordinal              uint64         `json:"ordinal"`
	VehicleGUID          guid.GUID      `json:"vehicle_guid"`
	ControllerGUID       guid.GUID      `json:"controller_guid"`
	VehicleName          string         `json:"vehicle_name,omitempty"`
	ControllerName       string         `json:"controller_name,omitempty"`
	ActiveControllerGUID *guid.GUID     `json:"active_controller_guid,omitempty"`
}

type Metadata struct {
	Intervals   []ControlInterval `json:"intervals,omitempty"`
	Diagnostics []Diagnostic      `json:"diagnostics,omitempty"`
}

func (m *Metadata) Scan(src any) error {
	switch value := src.(type) {
	case nil:
		*m = Metadata{}
		return nil
	case string:
		return json.Unmarshal([]byte(value), m)
	case []byte:
		return json.Unmarshal(value, m)
	case json.RawMessage:
		return json.Unmarshal(value, m)
	default:
		return fmt.Errorf("scan vehicle metadata: unexpected type %T", src)
	}
}

func (m Metadata) Value() (driver.Value, error) {
	return json.Marshal(m)
}

type session struct {
	id      string
	endedAt *time.Time
	changes []*messages.VehicleControl
}

type Tracker struct {
	sessions []*session
	current  *session
}

func New() *Tracker {
	return &Tracker{}
}

func (t *Tracker) Process(message messages.Message) {
	switch msg := message.(type) {
	case *messages.Versions:
		if msg.SessionID != "" {
			t.startSession(msg.SessionID, msg.Date())
		}
	case *messages.VehicleControl:
		if t.current == nil {
			t.current = &session{}
			t.sessions = append(t.sessions, t.current)
		}
		t.current.changes = append(t.current.changes, msg)
	}
}

func (t *Tracker) startSession(id string, at time.Time) {
	if t.current != nil && t.current.id == id {
		return
	}
	if t.current != nil {
		endedAt := at
		t.current.endedAt = &endedAt
	}
	t.current = &session{id: id}
	t.sessions = append(t.sessions, t.current)
}

func (t *Tracker) MetadataForRange(start, end time.Time) Metadata {
	var metadata Metadata
	for _, session := range t.sessions {
		intervals, diagnostics := buildSession(session)
		for _, interval := range intervals {
			if intervalOverlaps(interval, start, end) {
				metadata.Intervals = append(metadata.Intervals, interval)
			}
		}
		for _, diagnostic := range diagnostics {
			at := time.UnixMilli(diagnostic.TimestampMs)
			if !at.Before(start) && !at.After(end) {
				metadata.Diagnostics = append(metadata.Diagnostics, diagnostic)
			}
		}
	}
	return metadata
}

func buildSession(s *session) ([]ControlInterval, []Diagnostic) {
	changes := slices.Clone(s.changes)
	slices.SortStableFunc(changes, func(a, b *messages.VehicleControl) int {
		if cmp := a.Date().Compare(b.Date()); cmp != 0 {
			return cmp
		}
		if a.Ordinal < b.Ordinal {
			return -1
		}
		if a.Ordinal > b.Ordinal {
			return 1
		}
		return 0
	})

	intervals := make([]ControlInterval, 0, len(changes))
	diagnostics := make([]Diagnostic, 0)
	active := make(map[guid.GUID]int)

	for _, change := range changes {
		currentIndex, hasCurrent := active[change.VehicleGUID]
		if change.Action == messages.VehicleControlAssign {
			if hasCurrent && intervals[currentIndex].ControllerGUID == change.ControllerGUID {
				diagnostics = append(diagnostics, diagnosticFromChange(DiagnosticDuplicateAssignment, s.id, change, nil))
				continue
			}
			if hasCurrent {
				closeInterval(&intervals[currentIndex], change.Date(), ReleaseReasonReassigned, true)
			}
			intervals = append(intervals, ControlInterval{
				SessionID:       s.id,
				VehicleGUID:     change.VehicleGUID,
				ControllerGUID:  change.ControllerGUID,
				VehicleName:     change.VehicleName,
				ControllerName:  change.ControllerName,
				AssignedAtMs:    change.Date().UnixMilli(),
				AssignedOrdinal: change.Ordinal,
			})
			active[change.VehicleGUID] = len(intervals) - 1
			continue
		}

		if !hasCurrent {
			diagnostics = append(diagnostics, diagnosticFromChange(DiagnosticUnmatchedRelease, s.id, change, nil))
			continue
		}
		current := &intervals[currentIndex]
		if current.ControllerGUID != change.ControllerGUID {
			activeController := current.ControllerGUID
			diagnostics = append(diagnostics, diagnosticFromChange(DiagnosticStaleRelease, s.id, change, &activeController))
			continue
		}
		closeInterval(current, change.Date(), ReleaseReasonExplicit, false)
		delete(active, change.VehicleGUID)
	}

	if s.endedAt != nil {
		for _, currentIndex := range active {
			closeInterval(&intervals[currentIndex], *s.endedAt, ReleaseReasonSessionBoundary, true)
		}
	}

	return intervals, diagnostics
}

func closeInterval(interval *ControlInterval, at time.Time, reason ReleaseReason, inferred bool) {
	releasedAtMs := at.UnixMilli()
	interval.ReleasedAtMs = &releasedAtMs
	interval.ReleaseReason = reason
	interval.InferredRelease = inferred
}

func diagnosticFromChange(kind DiagnosticKind, sessionID string, change *messages.VehicleControl, activeController *guid.GUID) Diagnostic {
	return Diagnostic{
		Kind:                 kind,
		SessionID:            sessionID,
		TimestampMs:          change.Date().UnixMilli(),
		Ordinal:              change.Ordinal,
		VehicleGUID:          change.VehicleGUID,
		ControllerGUID:       change.ControllerGUID,
		VehicleName:          change.VehicleName,
		ControllerName:       change.ControllerName,
		ActiveControllerGUID: activeController,
	}
}

func intervalOverlaps(interval ControlInterval, start, end time.Time) bool {
	assignedAt := time.UnixMilli(interval.AssignedAtMs)
	if assignedAt.After(end) {
		return false
	}
	if interval.ReleasedAtMs == nil {
		return true
	}
	return time.UnixMilli(*interval.ReleasedAtMs).After(start)
}
