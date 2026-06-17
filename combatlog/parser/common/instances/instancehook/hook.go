package instancehook

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/google/uuid"
)

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

// BaseHook provides no-op implementations of all optional Hook methods.
// Embed this in hook implementations that only care about a subset.
type BaseHook struct{}

func (BaseHook) FightStarted(uuid.UUID, messages.Message) {}
func (BaseHook) FightEnded(uuid.UUID, messages.Message)   {}
