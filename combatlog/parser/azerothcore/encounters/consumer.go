package encounters

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/google/uuid"
)

func New(ctx context.Context, logger *slog.Logger) *encounters.State {
	s := encounters.NewWithInstanceResolver(ctx, logger, func(verbose bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
		// Treat all zones as truth
		return NewAzeorthCoreInstance(ctx, logger, db, z)
	})
	return s
}

func NewAzeorthCoreInstance(ctx context.Context, logger *slog.Logger, db *unitdb.Units, firstZone zone.Zone) *instances.Hookable {
	idf := identifier.NewIdentifier(map[uint32]instances.Identity{})

	return instances.NewHookable(ctx, logger, db, firstZone, instances.InstanceParams{
		Name: firstZone.Name,
		MatchesZone: func(z zone.Zone) bool {
			return z.InstanceID == firstZone.InstanceID
		},
		Idf:      idf,
		Rankings: nil,
		ExtraHooks: []instancehook.Hook{
			&AzerothCoreInstanceHook{
				ID: idf,
			},
		},
	})
}

var _ instancehook.Hook = (*AzerothCoreInstanceHook)(nil)

type AzerothCoreInstanceHook struct {
	ID *identifier.Identifier
}

func (a AzerothCoreInstanceHook) ProcessMessage(active bool, encounterID uuid.UUID, m messages.Message) error {
	switch msg := m.(type) {
	case *messages.Unit:
		if msg.Guid.IsPlayer() {
			return nil
		}

		entry, ok := msg.Guid.GetEntry()
		if !ok {
			return nil
		}

		a.ID.AddEntryId(entry, instances.Identity{
			Affiliation:     msg.Affiliation,
			Name:            msg.Name,
			EncounterName:   "",
			Boss:            msg.Boss,
			EncounterNameFn: nil,
		})
		var _ = msg
	}
	return nil
}

func (a AzerothCoreInstanceHook) Finalize(ctx context.Context) error                     { return nil }
func (a AzerothCoreInstanceHook) FightStarted(encounterID uuid.UUID, m messages.Message) {}
func (a AzerothCoreInstanceHook) FightEnded(encounterID uuid.UUID, m messages.Message)   {}
