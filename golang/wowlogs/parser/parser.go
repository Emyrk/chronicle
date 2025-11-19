package parser

import (
	"fmt"
	"log/slog"
	"reflect"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
)

type parseLine = func(ts time.Time, content string) ([]Message, error)

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

func (p *Parser) LogLine(line string) ([]Message, error) {
	ts, content, err := p.liner.Line(line)
	if err != nil {
		return nil, fmt.Errorf("failed to parse log line: %v", err)
	}
	content = strings.TrimSpace(content)

	for _, parser := range []parseLine{
		p.fCombatantGUID,
		p.fCombatantInfo,
		p.fBugDamageSpellHitOrCrit,
		p.fSpellCastAttempt,
		p.fGain,
		p.fDamageSpellHitOrCrit,
	} {
		m, err := parser(ts, content)
		if err != nil {
			return nil, fmt.Errorf("parse line failed: %v", err)
		}

		if len(m) == 0 {
			continue
		}

		for _, msg := range m {
			if msg.Timestamp().IsZero() {
				return nil, fmt.Errorf("timestamp is zero for message type: %s", reflect.TypeOf(m).String())
			}
		}

		return m, nil
	}

	// TODO: Handle all this
	return Skip(ts, "unhandled log line"), nil
}

func notHandled() ([]Message, error) {
	return nil, nil
}

func set(m ...Message) []Message {
	return m
}
