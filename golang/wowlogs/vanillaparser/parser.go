package vanillaparser

import (
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
	"github.com/Emyrk/chronicle/golang/wowlogs/merge"
)

type parseLine = func(ts time.Time, content string) ([]Message, error)

type Parser struct {
	logger  *slog.Logger
	scanner merge.Scan
	liner   *lines.Liner
	state   *State
}

func New(logger *slog.Logger, r io.Reader) (*Parser, error) {
	return &Parser{
		logger:  logger,
		scanner: merge.FromIOReader(lines.NewLiner(), r),
		liner:   lines.NewLiner(),
		state:   NewState(logger),
	}, nil
}

func NewFromScanner(logger *slog.Logger, liner *lines.Liner, scan merge.Scan) *Parser {
	return &Parser{
		logger:  logger,
		scanner: scan,
		liner:   liner,
		state:   NewState(logger),
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

func (p *Parser) Advance() ([]Message, error) {
	ts, content, err := p.scanner()
	if err != nil {
		return nil, err
	}
	content = strings.TrimSpace(content)

	for _, parser := range []parseLine{
		p.fCombatantGUID,
		p.fCombatantInfo,
		p.fZoneInfo,
		p.fV2Casts,
		p.fLoot,
		p.fBugDamageSpellHitOrCrit,
		p.fSpellCastAttempt,
		p.fGain,
		p.fDamageSpellHitOrCritNoSchool,
		p.fDamageSpellHitOrCritSchool,
		p.fDamagePeriodic,
		p.fDamageShield,
		p.fDamageHitOrCrit,
		p.fDamageHitOrCritSchool,
		p.fHealCrit,
		p.fHealHit,
		p.fAuraGainHarmfulHelpful,
		p.fAuraFade,
		p.fDamageSpellSplit,
		p.fDamageSpellMiss,
		p.fDamageSpellBlockParryEvadeDodgeResistDeflect,
		p.fDamageSpellAbsorb,
		p.fDamageSpellAbsorbSelf,
		p.fDamageReflect,
		p.fDamageProcResist,
		p.fDamageSpellImmune,
		p.fDamageMiss,
		p.fDamageBlockParryEvadeDodgeDeflect,
		p.fDamageAbsorbResist,
		p.fDamageImmune,
		p.fSpellCastPerformDurability,
		p.fSpellCastPerform,
		p.fSpellCastPerformUnknown,
		p.fUnitDieDestroyed,
		p.fUnitSlay,
		p.fAuraDispel,
		p.fAuraInterrupt,
		p.fCreates,
		p.fGainsAttack,
		p.fFallDamage,
		p.fGainNoSource,
	} {
		m, err := parser(ts, content)
		if err != nil {
			return nil, fmt.Errorf("parse line failed: %v", err)
		}

		if len(m) == 0 {
			continue
		}

		for _, msg := range m {
			if msg.Date().IsZero() {
				return nil, fmt.Errorf("timestamp is zero for message type: %s", reflect.TypeOf(m).String())
			}
		}

		return m, nil
	}

	return nil, nil
}
