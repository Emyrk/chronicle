package vanillaparser

import (
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
	"github.com/Emyrk/chronicle/golang/wowlogs/merge"
	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/whoami"
)

type parseLine = func(ts time.Time, content string) ([]Message, error)

type Parser struct {
	logger  *slog.Logger
	scanner merge.Scan
	liner   *lines.Liner
	state   *State

	setup sync.Once
}

func New(logger *slog.Logger, r io.Reader) (*Parser, error) {
	return &Parser{
		logger:  logger,
		scanner: merge.FromIOReader(lines.NewLiner(), r),
		liner:   lines.NewLiner(),
	}, nil
}

func NewFromScanner(logger *slog.Logger, liner *lines.Liner, scan merge.Scan) *Parser {
	return &Parser{
		logger:  logger,
		scanner: scan,
		liner:   liner,
	}
}

func (p *Parser) State() *State {
	return p.state
}

// Merger returns a configured merger for this parser.
func Merger(logger *slog.Logger) *merge.Merger {
	return merge.NewMerger(logger,
		merge.WithMiddleWare(OnlyKeepRawV2Casts),
	)
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
			slog.String("name", me.Name),
			slog.String("guid", me.Gid.String()),
			slog.Int("lines_read", lc),
		)
		p.state = NewState(p.logger, me)
		p.scanner = scan
	})
	return initErr
}

func (p *Parser) Advance() ([]Message, error) {
	err := p.init()
	if err != nil {
		return nil, fmt.Errorf("init: %w", err)
	}

	ts, content, err := p.scanner()
	if err != nil {
		return nil, err
	}

	content, err = p.state.Preprocess(content)
	if err != nil {
		return nil, fmt.Errorf("preprocess line failed: %v", err)
	}
	content = strings.TrimSpace(content)

	if content == "" {
		// Maybe the preprocessing removed all content, it does not matter.
		// Empty lines are not interesting.
		return Skip(ts, "empty line"), nil
	}

	msgs, err := p.parseContent(ts, content)
	if err != nil {
		return nil, err
	}

	for _, msg := range msgs {
		if msg.Date().IsZero() {
			return nil, fmt.Errorf("timestamp is zero for message type: %s", reflect.TypeOf(msg).String())
		}
	}
	return msgs, err
}

func (p *Parser) parseContent(ts time.Time, content string) ([]Message, error) {
	for _, parser := range []parseLine{
		p.fCombatantGUID,
		p.fCombatantInfo,                // ✓
		p.fZoneInfo,                     // ✓
		p.fV2Casts,                      // ✓
		p.fLoot,                         // ✓
		p.fBugDamageSpellHitOrCrit,      // ✓
		p.fSpellCastAttempt,             // ✓
		p.fGainWithSource,               // ✓
		p.fDamageSpellHitOrCritNoSchool, // ✓
		p.fDamageSpellHitOrCritSchool,   // ✓
		p.fDamagePeriodic,               // ✓
		p.fDamageShield,                 // ✓
		p.fDamageHitOrCritNoSchool,      // ✓
		p.fDamageHitOrCritSchool,        // ✓
		p.fHeal,                         // ✓
		p.fAuraGainHarmfulHelpful,       // ✓
		p.fAuraFade,                     // ✓
		p.fDamageSpellSplit,             // x TODO: need an example
		p.fDamageSpellMiss,              // ✓
		p.fDamageSpellBlockParryEvadeDodgeResistDeflect, // ✓
		p.fDamageSpellAbsorb,                            // ✓
		p.fDamageSpellAbsorbSelf,                        // x TODO: need an example
		p.fDamageReflect,                                // ✓
		p.fDamageProcResist,                             // x TODO: need an example
		p.fDamageSpellImmune,                            // ✓
		p.fDamageMiss,                                   // ✓
		p.fDamageBlockParryEvadeDodgeDeflect,            // ✓
		p.fDamageAbsorbResist,                           // ✓
		p.fDamageImmune,                                 // ✓
		p.fSpellCastPerformDurability,                   // x TODO: need an example
		p.fSpellCastPerform,                             // ✓
		p.fSpellCastPerformUnknown,                      // ✓
		p.fHonorableKill,                                // ✓ (TODO: add currency gain for honor)
		p.fUnitDieDestroyed,                             // ✓
		p.fUnitSlay,                                     // ✓
		p.fAuraDispel,                                   // ✓
		p.fAuraInterrupt,                                // ✓
		p.fCreates,
		p.fGainsAttack,
		p.fFallDamage, // ✓
		p.fGainNoSource,
	} {
		m, err := parser(ts, content)
		if err != nil {
			return nil, fmt.Errorf("parse line failed: %v", err)
		}

		if len(m) == 0 {
			continue
		}

		return m, nil
	}

	return set(UnparsedLine{
		MessageBase: Base(ts),
		Content:     content,
	}), nil
}
