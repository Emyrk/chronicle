package smcathedral

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

// Cathedral is the Scarlet Monastery Cathedral instance
type Cathedral struct {
	logger *slog.Logger
	db     *unitdb.Units

	// All possible encounters in this instance
	encounters []encounters.Encounter

	// Fight tracking
	fights            *encounters.Fights
	currentEncounter  encounters.Encounter
	currentZone       zone.Zone
}

func New(logger *slog.Logger, db *unitdb.Units, z zone.Zone) *Cathedral {
	c := &Cathedral{
		logger:      logger,
		db:          db,
		fights:      encounters.NewFights(logger, db, z),
		currentZone: z,
	}

	// Define all encounters in this instance
	c.encounters = []encounters.Encounter{
		NewWhitemaneEncounter(),
		NewMograineEncounter(),
		// Add more encounters as needed
	}

	return c
}

func (c *Cathedral) Name() string {
	return "Scarlet Monastery Cathedral"
}

func (c *Cathedral) MatchesZone(z zone.Zone) bool {
	return z.Name == "Scarlet Monastery"
}

func (c *Cathedral) Process(m messages.Message) error {
	// Process the message through fight tracking
	err := c.fights.Process(m)
	if err != nil {
		return err
	}

	// If we have a current fight, try to detect which encounter it is
	if c.fights.CurrentFight != nil && c.fights.CurrentFight.IsStarted() {
		c.detectEncounter(m)
	}

	return nil
}

func (c *Cathedral) detectEncounter(m messages.Message) {
	// If we already detected an encounter, don't re-detect
	if c.currentEncounter != nil {
		return
	}

	// Try to detect which encounter this is
	for _, encounter := range c.encounters {
		if encounter.Detect(c.fights.CurrentFight, m) {
			c.currentEncounter = encounter
			c.logger.Info("detected encounter",
				slog.String("encounter", encounter.Name()),
				slog.String("instance", c.Name()),
			)
			
			// Call the encounter's OnStart hook
			if err := encounter.OnStart(c.fights.CurrentFight); err != nil {
				c.logger.Error("encounter OnStart failed",
					slog.String("encounter", encounter.Name()),
					slog.Any("error", err),
				)
			}
			break
		}
	}
}

func (c *Cathedral) Encounters() []encounters.Encounter {
	return c.encounters
}

func (c *Cathedral) CurrentEncounter() encounters.Encounter {
	return c.currentEncounter
}

func (c *Cathedral) AllFights() []*encounters.Fight {
	return c.fights.Fights
}
