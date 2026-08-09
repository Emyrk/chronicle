package encounters

import (
	"context"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/google/uuid"
)

func New(ctx context.Context, logger *slog.Logger, reg *registry.Registry) *encounters.State {
	return encounters.NewWithInstanceResolver(ctx, logger, func(verbose bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
		if reg != nil {
			if inst := reg.GetInstance(ctx, verbose, z, db, reg.Flavor()); inst != nil {
				inst.AddHook(&AzerothCoreInstanceHook{ID: inst.Identifier})
				return inst
			}
		}

		return NewAzerothCoreInstance(parseoptions.WithVerbose(ctx, verbose), logger, db, z)
	})
}

func NewAzerothCoreInstance(ctx context.Context, logger *slog.Logger, db *unitdb.Units, firstZone zone.Zone) *instances.Hookable {
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

func (a AzerothCoreInstanceHook) ProcessMessage(_ bool, _ uuid.UUID, m messages.Message) error {
	switch msg := m.(type) {
	case *messages.Unit:
		if msg.Guid.IsPlayer() {
			return nil
		}

		entry, ok := msg.Guid.GetEntry()
		if !ok {
			return nil
		}

		identity, known := a.ID.HostileEntries()[entry]
		if known {
			// Preserve configured encounter names and custom encounter functions,
			// while preferring server-reported classification metadata.
			identity.Affiliation = msg.Affiliation
			if msg.Name != "" {
				identity.Name = msg.Name
			}
			identity.Boss = identity.Boss || msg.Boss
		} else {
			identity = instances.Identity{
				Affiliation: msg.Affiliation,
				Name:        msg.Name,
				Boss:        msg.Boss,
			}
		}
		a.ID.AddEntryId(entry, identity)
	}
	return nil
}

func (a AzerothCoreInstanceHook) Finalize(_ context.Context) error             { return nil }
func (a AzerothCoreInstanceHook) FightStarted(_ uuid.UUID, _ messages.Message) {}
func (a AzerothCoreInstanceHook) FightEnded(_ uuid.UUID, _ messages.Message)   {}
