package epoch

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type Parser struct {
	logger  *slog.Logger
	wowDB   gamedb.SpellFetcher
	scanner *bufio.Scanner

	lastDate    time.Time
	synthetics  *synthetic.Synthetic
	itemFetcher gamedb.GearResolver
	baseYear    int
}

func New(logger *slog.Logger, r io.Reader, wowDB gamedb.SpellFetcher, gear gamedb.GearResolver) (*Parser, error) {
	if wowDB == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	return &Parser{
		logger:      logger,
		wowDB:       wowDB,
		scanner:     bufio.NewScanner(r),
		synthetics:  synthetic.New(logger, wowDB),
		itemFetcher: gear,
		baseYear:    time.Now().Year(),
	}, nil
}

// SetBaseYear overrides the year used for timestamps (WotLK logs omit the year).
func (p *Parser) SetBaseYear(year int) {
	p.baseYear = year
}

func (p *Parser) Advance(ctx context.Context) ([]messages.Message, error) {
	msgs, err := p.advance(ctx)
	if err != nil {
		return nil, err
	}

	msgs, err = p.synthetics.ProcessMessages(msgs)
	if err != nil {
		return nil, fmt.Errorf("processing synthetics: %w", err)
	}

	return msgs, nil
}

func (p *Parser) advance(_ context.Context) (_ []messages.Message, final error) {
	ok := p.scanner.Scan()
	if !ok {
		return nil, io.EOF
	}
	next := p.scanner.Text()
	if next == "" {
		return messages.Unparsed(time.Time{}, next), nil
	}

	ts, event, m, err := ParseLine(next)
	if err != nil {
		return nil, err
	}
	defer func() {
		if final == nil && m.Error() != nil {
			final = m.Error()
		}
	}()

	// Apply base year — WotLK timestamps have no year.
	ts = ts.AddDate(p.baseYear, 0, 0)

	if !p.lastDate.IsZero() && ts.Before(p.lastDate.Add(-time.Second)) {
		return nil, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards: last %v, current %v", p.lastDate, ts))
	}
	p.lastDate = ts

	return p.dispatch(ts, event, m, next)
}

func (p *Parser) Spell(id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return p.wowDB.Spell(id)
}
