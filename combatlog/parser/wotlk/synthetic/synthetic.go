package synthetic

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic/zonedetector"
	"github.com/Emyrk/chronicle/database/gamedb"
)

// NameResolver looks up a name for a GUID. Populated by the parser from
// combat log source/dest fields.
type NameResolver interface {
	Get(id guid.GUID) (string, bool)
}

// Synthetic processes the raw combat log events, and occasionally will insert
// or mutate synthetic events to help downstream consumers.
type Synthetic struct {
	logger *slog.Logger

	unitInfo     *unitInfo
	petOwnership *petOwnership
	zoneDetector *zonedetector.ZoneDetector
	slain        *synthetic.SlainDetective
	absorption   *synthetic.Absorption
	possession   *synthetic.Possession
	earthShield  *earthShieldAttribution

	wowDB gamedb.GameDB

	unitInfoDur     time.Duration
	petOwnershipDur time.Duration
	zoneDetectorDur time.Duration
	absorptionDur   time.Duration
}

func New(ctx context.Context, logger *slog.Logger, wowDB gamedb.GameDB, reg *registry.Registry, names NameResolver, creditEarthShield bool) *Synthetic {
	var zd *zonedetector.ZoneDetector
	if reg != nil {
		zd = zonedetector.New(logger, reg)
	}

	s := &Synthetic{
		slain:        synthetic.NewSlainDetective(),
		absorption:   synthetic.NewAbsorption(logger),
		logger:       logger,
		wowDB:        wowDB,
		unitInfo:     newUnitInfo(ctx, logger, wowDB, names, wowDB),
		petOwnership: newPetOwnership(logger, names),
		possession:   synthetic.NewPossession(ctx, logger),
		zoneDetector: zd,
	}
	if creditEarthShield {
		s.earthShield = newEarthShieldAttribution()
	}
	return s
}

func (s *Synthetic) DetailedTimes() map[string]time.Duration {
	return map[string]time.Duration{
		"parser.synthetic.unit_info":     s.unitInfoDur,
		"parser.synthetic.pet_ownership": s.petOwnershipDur,
		"parser.synthetic.zone_detector": s.zoneDetectorDur,
		"parser.synthetic.absorption":    s.absorptionDur,
	}
}

func (s *Synthetic) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	now := time.Now()
	msgs = s.unitInfo.ProcessMessages(msgs)
	s.unitInfoDur += time.Since(now)

	now = time.Now()
	msgs = s.petOwnership.ProcessMessages(msgs)
	s.petOwnershipDur += time.Since(now)

	if s.zoneDetector != nil {
		now = time.Now()
		msgs = s.zoneDetector.ProcessMessages(msgs)
		s.zoneDetectorDur += time.Since(now)
	}

	s.slain.ProcessMessages(msgs)
	msgs = s.possession.ProcessMessages(msgs)

	now = time.Now()
	msgs = s.absorption.ProcessMessages(msgs)
	s.absorptionDur += time.Since(now)

	if s.earthShield != nil {
		msgs = s.earthShield.ProcessMessages(msgs)
	}
	msgs = synthetic.CreditJudgementOfLightToTarget(msgs)

	return msgs, nil
}
