package vanilla

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/lines"
	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/merge"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/whoami"
	"github.com/Emyrk/chronicle/database/gamedb"
)

type parseLine = func(lCtx *logfile.Context, ts time.Time, content string) ([]messages.Message, error)

type Parser struct {
	logger  *slog.Logger
	scanner merge.Scan
	liner   *lines.Liner
	//state   *state.State
	you *youReplacer

	setup       sync.Once
	lastLogDate time.Time

	metrics Metrics
	// Used for human readable metrics output
	matchers     []parseLine
	matcherNames []string
	initMatchers sync.Once
	synthetics   *synthetic.Synthetic
}

func New(logger *slog.Logger, r io.Reader, wowDB gamedb.SpellFetcher) (*Parser, error) {
	// Single liner shared between scanner and parser so CLOCK_INFO from scanner
	// propagates to parser for timestamp adjustments.
	liner := lines.NewLiner()
	return &Parser{
		logger:     logger,
		scanner:    merge.FromIOReader(liner, r),
		liner:      liner,
		synthetics: synthetic.New(logger, wowDB),
		metrics: Metrics{
			PreProcessDuration: 0,
			TotalParseDuration: 0,
			TotalLinesParsed:   0,
			UnmatchedTime:      0,
			MatchingTime:       make(map[string]time.Duration),
			UnmatchingTime:     make(map[string]time.Duration),
		},
	}, nil
}

func NewFromScanner(logger *slog.Logger, liner *lines.Liner, scan merge.Scan, wowDB gamedb.SpellFetcher) *Parser {
	return &Parser{
		logger:  logger,
		scanner: scan,
		liner:   liner,
		metrics: Metrics{
			PreProcessDuration: 0,
			TotalParseDuration: 0,
			TotalLinesParsed:   0,
			UnmatchedTime:      0,
			MatchingTime:       make(map[string]time.Duration),
			UnmatchingTime:     make(map[string]time.Duration),
		},
		synthetics: synthetic.New(logger, wowDB),
	}
}

func (p *Parser) Metrics() Metrics { return p.metrics }

//func (p *Parser) State() *state.State {
//	return p.state
//}

// Merger returns a configured merger for this parser.
func Merger(logger *slog.Logger, opts ...merge.Option) *merge.Merger {
	m := merge.NewMerger(logger) //merge.WithMiddleWare(OnlyKeepRawV2Casts),
	for _, opt := range opts {
		opt(m)
	}
	return m
}

func (p *Parser) init() error {
	var initErr error
	p.setup.Do(func() {
		scan, me, lc, err := whoami.FindMe(p.liner, p.scanner)
		if err != nil {
			initErr = fmt.Errorf("find me: %w", err)
			return
		}

		p.logger.Info("Identified 'me' in logs",
			slog.String("name", me.Unit().Name),
			slog.String("guid", me.Unit().Gid.String()),
			slog.Int("lines_read", lc),
		)
		p.scanner = scan
		p.you = &youReplacer{Me: me}
	})
	return initErr
}

func (p *Parser) Advance(_ context.Context) ([]messages.Message, error) {
	err := p.init()
	if err != nil {
		return nil, parseerrors.AsFatalError(fmt.Errorf("init: %w", err))
	}
	now := time.Now()

	lCtx, ts, original, err := p.scanner()
	if err != nil {
		return nil, err
	}

	if p.lastLogDate.IsZero() {
		p.lastLogDate = ts
	}

	if ts.Before(p.lastLogDate.Add(-time.Second)) {
		return nil, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards: last %v, current %v", p.lastLogDate, ts))
	}

	preNow := time.Now()
	content, err := p.you.Preprocess(original)
	if err != nil {
		return nil, fmt.Errorf("preprocess line failed: %v", err)
	}
	content = strings.TrimSpace(content)
	p.metrics.PreProcessDuration += time.Since(preNow)

	if content == "" {
		// Maybe the preprocessing removed all content, it does not matter.
		// Empty lines are not interesting.
		return messages.Skip(ts, "empty line"), nil
	}

	msgs, err := p.ParseContent(lCtx, ts, content)
	if err != nil {
		return nil, err
	}

	for _, msg := range msgs {
		if msg.Date().IsZero() {
			return nil, fmt.Errorf("timestamp is zero for message type: %s", reflect.TypeOf(msg).String())
		}

		// In case the player changes, like logging onto an alt
		err = p.you.Me.Process(msg)
		if err != nil {
			return nil, fmt.Errorf("processing me for message: %w", err)
		}
	}
	p.metrics.TotalParseDuration += time.Since(now)
	p.metrics.TotalLinesParsed++

	msgs, err = p.synthetics.ProcessMessages(msgs)
	if err != nil {
		return nil, fmt.Errorf("processing synthetics: %w", err)
	}
	return msgs, nil
}

func (p *Parser) ParseContent(lctx *logfile.Context, ts time.Time, content string) ([]messages.Message, error) {
	if p.metrics.UnmatchingTime == nil {
		p.metrics.UnmatchingTime = make(map[string]time.Duration)
	}
	if p.metrics.MatchingTime == nil {
		p.metrics.MatchingTime = make(map[string]time.Duration)
	}

	start := time.Now()
	p.initMatchers.Do(func() {
		p.matchers = []parseLine{
			Either(p.fCombatantInfo),                                 // ✓
			Either(p.fUnitInfo),                                      // ✓
			Either(p.fZoneInfo),                                      // ✓
			OnlyRaw(p.fV2Casts),                                      // ✓
			Either(p.fLoot),                                          // ✓
			Either(p.fCombatCount),                                   // ✓
			Either(p.fRealm),                                         // ✓
			Either(p.fUnitDied),                                      // ✓
			Either(p.fPlayerPosition),                                // ✓
			Either(p.fClockInfo),                                     // ✓
			OnlyRaw(p.fBugDamageSpellHitOrCrit),                      // ✓
			OnlyRaw(p.fSpellCastAttempt),                             // ✓
			OnlyRaw(p.fGain),                                         // ✓
			OnlyRaw(p.fGainNoSource),                                 // ✓
			OnlyRaw(p.fDamageSpellHitOrCritNoSchool),                 // ✓
			OnlyRaw(p.fDamageSpellHitOrCritSchool),                   // ✓
			OnlyRaw(p.fDamagePeriodic),                               // ✓
			OnlyRaw(p.fDamageShield),                                 // ✓
			OnlyRaw(p.fDamageHitOrCritNoSchool),                      // ✓
			OnlyRaw(p.fDamageHitOrCritSchool),                        // ✓
			OnlyRaw(p.fHeal),                                         // ✓
			OnlyRaw(p.fAuraGainHarmfulHelpful),                       // ✓
			OnlyRaw(p.fAuraFade),                                     // ✓
			OnlyRaw(p.fDamageSpellSplit),                             // ✓
			OnlyRaw(p.fDamageSpellMiss),                              // ✓
			OnlyRaw(p.fDamageSpellBlockParryEvadeDodgeResistDeflect), // ✓
			OnlyRaw(p.fDamageSpellAbsorb),                            // ✓
			OnlyRaw(p.fDamageSpellAbsorbSelf),                        // x TODO: need an example
			OnlyRaw(p.fDamageReflect),                                // ✓
			OnlyRaw(p.fDamageProcResist),                             // x TODO: need an example
			OnlyRaw(p.fDamageSpellImmune),                            // ✓
			OnlyRaw(p.fDamageMiss),                                   // ✓
			OnlyRaw(p.fDamageBlockParryEvadeDodgeDeflect),            // ✓
			OnlyRaw(p.fDamageAbsorbResist),                           // ✓
			OnlyRaw(p.fDamageImmune),                                 // ✓
			OnlyRaw(p.fSpellCastPerformDurability),                   // x TODO: need an example
			OnlyRaw(p.fSpellCastPerform),                             // ✓
			OnlyRaw(p.fSpellCastPerformUnknown),                      // ✓
			OnlyRaw(p.fHonorableKill),                                // ✓ (TODO: add currency gain for honor)
			OnlyRaw(p.fUnitDieDestroyed),                             // ✓
			OnlyRaw(p.fUnitDieDestroyedExperience),                   // ✓ (TODO: add experience gain)
			OnlyRaw(p.fUnitSlay),                                     // ✓
			OnlyRaw(p.fAuraDispel),                                   // ✓
			OnlyRaw(p.fAuraInterrupt),                                // ✓
			OnlyRaw(p.fCreates),                                      // ✓
			OnlyRaw(p.fGainsAttack),                                  // ✓
			OnlyRaw(p.fFallDamage),                                   // ✓
			OnlyRaw(p.fDurabilityLoss),                               // ✓
			OnlyRaw(p.fUsesConsumable),                               // ✓
			OnlyRaw(p.fResourceDrain),                                // ✓
			OnlyRaw(p.fReputationChange),                             // ✓
			OnlyRaw(p.fPetEats),                                      // ✓
			OnlyRaw(p.fKilledBy),                                     // ✓
			OnlyRaw(p.fLavaSwimming),                                 // ✓
			OnlyRaw(p.fFullResist),                                   // x TODO: Unsure what to do with this, there is no target
			OnlyRaw(p.fFullImmune),                                   // ✓
			OnlyRaw(p.fPetHappiness),                                 // ✓
			OnlyRaw(p.fPetDismissed),                                 // ✓
		}
		p.matcherNames = make([]string, 0, len(p.matchers))

		for _, f := range p.matchers {
			p.matcherNames = append(p.matcherNames, runtime.FuncForPC(reflect.ValueOf(f).Pointer()).Name())
		}
	})

	for i, parser := range p.matchers {
		matcherName := p.matcherNames[i]
		startMatch := time.Now()
		m, err := parser(lctx, ts, content)
		if err != nil {
			return nil, err
		}

		for _, msg := range m {
			if dmg, ok := msg.(*messages.Damage); ok {
				dmg.Trailer = slices.DeleteFunc(dmg.Trailer, func(entry types.TrailerEntry) bool {
					// Adjust HitType to remove Hit flag if Glancing or Crushing is present
					if entry.HitType.Has(types.HitTypeGlancing) {
						dmg.HitType = (dmg.HitType | types.HitTypeGlancing) & (^types.HitTypeHit)
						return true
					}
					if entry.HitType.Has(types.HitTypeCrushing) {
						dmg.HitType = (dmg.HitType | types.HitTypeCrushing) & (^types.HitTypeHit)
						return true
					}
					return false
				})
			}
		}

		if len(m) == 0 {
			p.metrics.UnmatchingTime[matcherName] += time.Since(startMatch)
			continue
		}

		p.metrics.MatchingTime[matcherName] += time.Since(startMatch)
		p.metrics.UnmatchedTime += startMatch.Sub(start)
		return m, nil
	}

	return set(&messages.UnparsedLine{
		// v2 uses marks
		MessageBase: messages.Base(ts),
		Content:     content,
	}), nil
}

func set(m ...messages.Message) []messages.Message {
	return m
}
