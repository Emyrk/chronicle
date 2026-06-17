package instancehook_test

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/google/uuid"
)

// testHook embeds BaseHook and only implements the required methods.
type testHook struct {
	instancehook.BaseHook

	fightStartedCalls []uuid.UUID
	fightEndedCalls   []uuid.UUID
}

func (h *testHook) ProcessMessage(_ bool, _ uuid.UUID, _ messages.Message) error {
	return nil
}

func (h *testHook) Finalize(_ context.Context) error {
	return nil
}

func (h *testHook) FightStarted(encounterID uuid.UUID, _ messages.Message) {
	h.fightStartedCalls = append(h.fightStartedCalls, encounterID)
}

func (h *testHook) FightEnded(encounterID uuid.UUID, _ messages.Message) {
	h.fightEndedCalls = append(h.fightEndedCalls, encounterID)
}

// Verify testHook satisfies Hook interface.
var _ instancehook.Hook = (*testHook)(nil)

func TestBaseHook_SatisfiesInterface(t *testing.T) {
	t.Parallel()

	// A struct embedding BaseHook and implementing only ProcessMessage + Finalize
	// should satisfy the Hook interface.
	type minimalHook struct {
		instancehook.BaseHook
	}

	// FightStarted/FightEnded come from BaseHook for free — no panics.
	var h minimalHook
	h.FightStarted(uuid.New(), nil)
	h.FightEnded(uuid.New(), nil)
}
