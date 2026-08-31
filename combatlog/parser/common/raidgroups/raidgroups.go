package raidgroups

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type Composition [messages.RaidGroupCount][messages.RaidGroupSize]guid.GUID

func (c *Composition) Scan(src any) error {
	switch value := src.(type) {
	case []byte:
		return json.Unmarshal(value, c)
	case string:
		return json.Unmarshal([]byte(value), c)
	default:
		return fmt.Errorf("scan raid-group composition: unexpected type %T", src)
	}
}

func (c Composition) Value() (driver.Value, error) { return json.Marshal(c) }

type Observation struct {
	At          time.Time
	Composition Composition
}

type InstanceSnapshot struct {
	EncounterID *uuid.UUID
	ObservedAt  time.Time
	Composition Composition
}

type Tracker struct{ observations []Observation }

func New() *Tracker { return &Tracker{} }

func (t *Tracker) Process(message messages.Message) {
	group, ok := message.(*messages.RaidGroup)
	if !ok {
		return
	}
	t.observations = append(t.observations, Observation{At: group.Date(), Composition: Composition(group.Groups)})
}

func (t *Tracker) LatestBetween(start, end time.Time) (Observation, bool) {
	observation, ok := t.LatestAt(end)
	if !ok || observation.At.Before(start) {
		return Observation{}, false
	}
	return observation, true
}

func (t *Tracker) LatestAt(at time.Time) (Observation, bool) {
	if len(t.observations) == 0 {
		return Observation{}, false
	}
	observations := slices.Clone(t.observations)
	slices.SortStableFunc(observations, func(a, b Observation) int { return a.At.Compare(b.At) })
	var latest Observation
	found := false
	for _, observation := range observations {
		if observation.At.After(at) {
			break
		}
		latest, found = observation, true
	}
	return latest, found
}
