package synthetic

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/services"
)

// Synthetic processes the raw combat log events, and occasionally will insert
// or mutate synthetic events to help downstream consumers.
type Synthetic struct {
	logger       *slog.Logger
	slain        *SlainDetective
	mitigation   *mitigator
	extraAttack  *extraAttack
	demons       *enslaveDemon
	possession   *possession
	knownObjects *knownObjects
	razuvious    *razuviousOverkill
	wowDB        gamedb.SpellFetcher
	knownArmor   *knownArmor
	vanillaPlus  *vanillaplus

	slainDur        time.Duration
	extraAttackDur  time.Duration
	demonsDur       time.Duration
	possessionDur   time.Duration
	knownObjectsDur time.Duration
	razuviousDur    time.Duration
	knownArmorDur   time.Duration
	vanillaPlusDur  time.Duration
}

func New(ctx context.Context, logger *slog.Logger, wowDB gamedb.SpellFetcher) *Synthetic {
	return &Synthetic{
		logger:       logger,
		slain:        NewSlainDetective(),
		mitigation:   newMitigator(logger, wowDB),
		extraAttack:  newExtraAttack(ctx, logger, wowDB),
		demons:       newEnslaveDemon(logger),
		possession:   newPossession(logger),
		knownObjects: newKnownObjects(),
		razuvious:    newRazuviousOverkill(),
		knownArmor:   newKnownArmor(),
		vanillaPlus:  newVanillaPlus(),
		wowDB:        wowDB,
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
	}
}

func (s *Synthetic) ProcessMessages(msgs []messages.Message) ([]messages.Message, error) {
	now := time.Now()
	s.slain.ProcessMessages(msgs)
	s.slainDur += time.Since(now)

	now = time.Now()
	msgs = s.extraAttack.ProcessMessage(msgs)
	s.extraAttackDur += time.Since(now)

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

	if services.ServerName == services.ServerIdentityVanillaPlus {
		now := time.Now()
		s.knownArmor.ProcessMessages(msgs)
		s.knownArmorDur += time.Since(now)

		now = time.Now()
		s.vanillaPlus.ProcessMessages(msgs)
		s.vanillaPlusDur += time.Since(now)
	}

	return msgs, nil
}
