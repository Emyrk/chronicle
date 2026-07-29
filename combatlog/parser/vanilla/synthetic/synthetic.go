package synthetic

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
)

// Synthetic processes the raw combat log events, and occasionally will insert
// or mutate synthetic events to help downstream consumers.
type Synthetic struct {
	logger       *slog.Logger
	flavor       database.WoWFlavor
	slain        *SlainDetective
	mitigation   *mitigator
	extraAttack  *extraAttack
	demons       *enslaveDemon
	possession   *Possession
	knownObjects *knownObjects
	razuvious    *razuviousOverkill
	wowDB        gamedb.GameDB
	knownArmor   *knownArmor
	vanillaPlus  *vanillaplus
	absorption   *Absorption

	slainDur        time.Duration
	extraAttackDur  time.Duration
	demonsDur       time.Duration
	possessionDur   time.Duration
	knownObjectsDur time.Duration
	razuviousDur    time.Duration
	knownArmorDur   time.Duration
	vanillaPlusDur  time.Duration
	absorptionDur   time.Duration
}

func New(ctx context.Context, logger *slog.Logger, wowDB gamedb.GameDB) *Synthetic {
	fl, _ := parsectx.Flavor(ctx)
	return &Synthetic{
		logger:       logger,
		slain:        NewSlainDetective(),
		mitigation:   newMitigator(logger, wowDB),
		extraAttack:  newExtraAttack(ctx, logger, wowDB),
		demons:       newEnslaveDemon(logger),
		possession:   NewPossession(ctx, logger),
		knownObjects: newKnownObjects(),
		razuvious:    newRazuviousOverkill(),
		knownArmor:   newKnownArmor(),
		vanillaPlus:  newVanillaPlus(),
		absorption:   NewAbsorption(logger),
		wowDB:        wowDB,
		flavor:       fl,
	}
}

func (s *Synthetic) DetailedTimes() map[string]time.Duration {
	return map[string]time.Duration{
		"parser.synthetic.slain":         s.slainDur,
		"parser.synthetic.extra_attack":  s.extraAttackDur,
		"parser.synthetic.demons":        s.demonsDur,
		"parser.synthetic.possession":    s.possessionDur,
		"parser.synthetic.known_objects": s.knownObjectsDur,
		"parser.synthetic.razuvious":     s.razuviousDur,
		"parser.synthetic.known_armor":   s.knownArmorDur,
		"parser.synthetic.vanilla_plus":  s.vanillaPlusDur,
		"parser.synthetic.absorption":    s.absorptionDur,
	}
}

func (s *Synthetic) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	now := time.Now()
	s.slain.ProcessMessages(msgs)
	s.slainDur += time.Since(now)

	now = time.Now()
	msgs = s.extraAttack.ProcessMessage(msgs)
	s.extraAttackDur += time.Since(now)

	msgs = DetectResurrections(msgs)

	now = time.Now()
	msgs = s.demons.ProcessMessages(msgs)
	s.demonsDur += time.Since(now)

	now = time.Now()
	msgs = s.possession.ProcessMessages(msgs)
	s.possessionDur += time.Since(now)

	now = time.Now()
	msgs = s.knownObjects.ProcessMessages(msgs)
	s.knownObjectsDur += time.Since(now)

	now = time.Now()
	s.razuvious.ProcessMessages(msgs)
	s.razuviousDur += time.Since(now)

	if s.flavor.Has(database.FlavorVanillaPlus) {
		now := time.Now()
		s.knownArmor.ProcessMessages(msgs)
		s.knownArmorDur += time.Since(now)

		now = time.Now()
		s.vanillaPlus.ProcessMessages(msgs)
		s.vanillaPlusDur += time.Since(now)
	}

	now = time.Now()
	msgs = s.absorption.ProcessMessages(msgs)
	s.absorptionDur += time.Since(now)

	return msgs, nil
}
