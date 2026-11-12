package parserv2

import (
	"context"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
)

func (p *Parser) unitTarget(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeUnitTarget(ts, m)
}

func (p *Parser) unitCombat(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeUnitCombat(ts, m)
}

func (p *Parser) raidMark(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeRaidMark(ts, m)
}

func (p *Parser) threat(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeThreat(ts, m)
}

func (p *Parser) threatTank(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeThreatTank(ts, m)
}
