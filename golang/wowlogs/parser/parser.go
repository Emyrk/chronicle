package parser

import (
	"fmt"
	"log/slog"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/combatant"
	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
)

type parseLine = func(ts time.Time, content string) (Message, error)

type Parser struct {
	logger *slog.Logger
	liner  *lines.Liner
}

func NewParser(logger *slog.Logger) *Parser {
	return &Parser{
		logger: logger,
		liner:  lines.NewLiner(),
	}
}

func (p *Parser) LogLine(line string) (Message, error) {
	ts, content, err := p.liner.Line(line)
	if err != nil {
		return nil, fmt.Errorf("failed to parse log line: %v", err)
	}
	content = strings.TrimSpace(content)

	for _, parser := range []parseLine{
		p.combatantGUID,
		p.combatantInfo,
		p.bugDamageSpellHitOrCrit,
		p.spellCastAttempt,
		p.gain,
	} {
		m, err := parser(ts, content)
		if err != nil {
			return nil, fmt.Errorf("parse line failed: %v", err)
		}

		if m == nil {
			continue
		}

		if m.Timestamp().IsZero() {
			return nil, fmt.Errorf("timestamp is zero for message type: %s", reflect.TypeOf(m).String())
		}

		return m, nil
	}

	// TODO: Handle all this
	return SkippedMessage{
		MessageBase: Base(ts),
		Reason:      "unhandled log line",
	}, nil
}

func (p *Parser) combatantInfo(ts time.Time, content string) (Message, error) {
	if !strings.HasPrefix(content, "COMBATANT_INFO:") {
		return notHandled()
	}

	cbt, err := combatant.ParseCombatantInfo(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant info: %v", err)
	}

	var _ = cbt // TODO: use combatant info

	return SkippedMessage{
		MessageBase: Base(ts),
		Reason:      "combatant info",
	}, nil
}

func (p *Parser) combatantGUID(ts time.Time, content string) (Message, error) {
	if !strings.HasPrefix(content, "COMBATANT_GUID:") {
		return notHandled()
	}

	cbt, err := combatant.ParseCombatantGUID(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse combatant guid: %v", err)
	}

	var _ = cbt // TODO: use combatant guid

	return SkippedMessage{
		MessageBase: Base(ts),
		Reason:      "combatant guid",
	}, nil
}

func (p *Parser) bugDamageSpellHitOrCrit(ts time.Time, content string) (Message, error) {
	if !reBugDamageSpellHitOrCrit.MatchString(content) {
		return notHandled()
	}

	p.logger.Error("bugged line in logs, skipping",
		slog.String("content", content),
	)
	return &SkippedMessage{
		MessageBase: Base(ts),
		Reason:      "bugged line in logs",
	}, nil
}

// 10/29 22:09:40.825  Randgriz begins to cast Flash Heal.
// 10/29 22:09:42.175  Randgriz casts Flash Heal on Katrix.
// 10/29 22:09:42.175  Randgriz 's Flash Heal critically heals Katrix for 2534.
func (p *Parser) spellCastAttempt(ts time.Time, content string) (Message, error) {
	matches := reSpellCastAttempt.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	unit, spell := matches[1], matches[2]
	return SpellCastAttempt{
		MessageBase: Base(ts),
		Caster: Unit{
			Name: unit,
		},
		SpellName: spell,
	}, nil
}

func (p *Parser) gain(ts time.Time, content string) (Message, error) {
	matches := reGain.FindStringSubmatch(content)
	if matches == nil {
		return notHandled()
	}

	target, amountStr, resource, caster, spell := matches[1], matches[2], matches[3], matches[4], matches[5]
	amount, err := strconv.ParseUint(amountStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("resource gain amount %q is not valid: %v", amountStr, err)
	}

	return ResourceGain{
		MessageBase: Base(ts),
		Target:      Unit{Name: target},
		Amount:      uint32(amount),
		Resource:    resource,
		Caster:      Unit{Name: caster},
		Spell:       spell,
	}, nil
}

func notHandled() (Message, error) {
	return nil, nil
}
