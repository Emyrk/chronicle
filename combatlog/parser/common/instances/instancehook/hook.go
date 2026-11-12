package instancehook

import (
	"context"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/google/uuid"
)

// Preprocessor mutates or enriches a message before any instance consumer,
// including the unit database, characters, hooks, and encounter serializer.
type Preprocessor interface {
	ProcessMessage(messages.Message) error
}

type Hook interface {
	ProcessMessage(active bool, encounterID uuid.UUID, m messages.Message) error

	// Finalize is called when the instance is finalized. Nothing more should happen after this.
	Finalize(ctx context.Context) error

	// FightStarted is called when a new fight begins (first hostile becomes active).
	FightStarted(encounterID uuid.UUID, m messages.Message)
	// FightEnded is called after a fight is finalized (all hostiles inactive).
	FightEnded(encounterID uuid.UUID, m messages.Message)

	// CharacterActive/CharacterInactive are not needed here.
	// Use character.SetHook.ActivityChange for character activity changes.
}

// FightFinalizedHook receives the exact materialized fight boundaries after
// FightEnded and before the encounter is stored.
type FightFinalizedHook interface {
	FightFinalized(encounterID uuid.UUID, start, end time.Time)
}

// BaseHook provides no-op implementations of all optional Hook methods.
// Embed this in hook implementations that only care about a subset.
type BaseHook struct{}

func (BaseHook) FightStarted(uuid.UUID, messages.Message) {}
func (BaseHook) FightEnded(uuid.UUID, messages.Message)   {}

// DifficultyResolver optionally resolves an encounter-specific mode at fight
// finalization, after FightFinalized. Returning false preserves the initial zone
// snapshot. An empty override means Normal. If multiple hooks resolve a mode,
// the last override in registration order wins. No detector is enabled by default.
type DifficultyResolver interface {
	ResolveDifficulty(encounterID uuid.UUID, initial string) (difficulty string, override bool)
}
