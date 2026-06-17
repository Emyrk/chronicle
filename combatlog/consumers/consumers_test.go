package consumers

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type detailedTimingConsumerStub struct {
	times map[string]time.Duration
}

func (d detailedTimingConsumerStub) Process(_ messages.Message) error {
	return nil
}

func (d detailedTimingConsumerStub) DetailedTimes() map[string]time.Duration {
	return d.times
}

func TestConsumersTimesIncludesDetailedTimes(t *testing.T) {
	t.Parallel()

	consumer := detailedTimingConsumerStub{
		times: map[string]time.Duration{
			"encounter_state.total": 3 * time.Millisecond,
		},
	}
	c := New(slog.Default(), consumer)
	c.time["parser"] = 2 * time.Millisecond
	c.time["encounter_state.total"] = 1 * time.Millisecond

	got := c.Times()
	if got["parser"] != 2*time.Millisecond {
		t.Fatalf("expected parser duration %s, got %s", 2*time.Millisecond, got["parser"])
	}
	if got["encounter_state.total"] != 4*time.Millisecond {
		t.Fatalf("expected encounter_state.total duration %s, got %s", 4*time.Millisecond, got["encounter_state.total"])
	}

	got["parser"] = 99 * time.Millisecond
	if c.time["parser"] != 2*time.Millisecond {
		t.Fatalf("expected source parser duration to remain %s, got %s", 2*time.Millisecond, c.time["parser"])
	}
}
