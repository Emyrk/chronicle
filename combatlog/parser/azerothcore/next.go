package azerothcore

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	parservanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
	nextacore "github.com/Emyrk/chronicle/combatlog/parsernext/azerothcore"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// NextSource independently reads ACore records. No legacy Parser is constructed.
type NextSource struct {
	input      *scannerCompatibleReader
	reader     *common.FileReader
	decoder    *nextacore.Decoder
	synthetics *synthetic.Synthetic
	lastDate   time.Time
	metrics    parservanilla.Metrics
}

func NewNext(ctx context.Context, logger *slog.Logger, r io.Reader, gameDB gamedb.GameDB, gear gamedb.GearResolver) (*NextSource, error) {
	if gameDB == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	if logger == nil {
		logger = slog.Default()
	}
	if r == nil {
		return nil, fmt.Errorf("source is required")
	}
	input := &scannerCompatibleReader{reader: r}
	reader, err := common.NewFileReader(input, bufio.MaxScanTokenSize-1)
	if err != nil {
		return nil, err
	}
	var resolveGear func([]combatant.GearItem)
	if gear != nil {
		resolveGear = gear.ResolveGear
	}
	lookup := func(id chrondbc.SpellID, _ ...string) *chrondbc.Spell {
		if id == 0 {
			return nil
		}
		spell, err := gameDB.Spell(context.Background(), id)
		if err != nil {
			return nil
		}
		return spell
	}
	extensions := nextacore.NewExtensions(logger, func(id chrondbc.SpellID) *chrondbc.Spell {
		if id == 0 {
			return nil
		}
		spell, err := gameDB.Spell(context.Background(), id)
		if chrondbc.IsSpellNotFound(err) {
			value := chrondbc.UnknownSpell(id)
			return &value
		}
		if err != nil {
			return nil
		}
		return spell
	}, resolveGear)
	var addon *companion.Parser
	decoder, err := nextacore.NewDecoder(ctx, logger, cleu.Hooks{
		LookupSpell: lookup,
		DecodeEvent: extensions.DecodeEvent,
		DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
			if !companion.IsCompanionMessage(payload) {
				return nil, false, nil
			}
			if addon == nil {
				addon = companion.New(logger)
			}
			msgs, err := addon.Feed(ts, payload)
			return msgs, true, err
		},
	}, resolveGear)
	if err != nil {
		return nil, err
	}
	return &NextSource{input: input, reader: reader, decoder: decoder, synthetics: synthetic.New(ctx, logger, gameDB), metrics: parservanilla.Metrics{MatchingTime: map[string]time.Duration{}, UnmatchingTime: map[string]time.Duration{}}}, nil
}

func (p *NextSource) Metrics() parservanilla.Metrics { return p.metrics }

// Legacy ACore's synthetic wrapper does not expose detailed timings.
func (p *NextSource) DetailedTimes() map[string]time.Duration { return map[string]time.Duration{} }

func (p *NextSource) Advance(ctx context.Context) ([]messages.Message, error) {
	start := time.Now()
	msgs, err := p.advance(ctx)
	p.metrics.TotalParseDuration += time.Since(start)
	if err != nil {
		return nil, err
	}
	p.metrics.TotalLinesParsed++
	msgs, err = p.synthetics.ProcessMessages(msgs)
	if err != nil {
		return nil, fmt.Errorf("processing synthetics: %w", err)
	}
	return msgs, nil
}

func (p *NextSource) advance(ctx context.Context) (_ []messages.Message, final error) {
	line, err := p.reader.Next(ctx)
	if err == io.EOF {
		if p.input.err != nil {
			return nil, parseerrors.AsFatalError(p.input.err)
		}
		return nil, io.EOF
	}
	if err != nil {
		if errors.Is(err, common.ErrLineTooLong) {
			err = bufio.ErrTooLong
		}
		return nil, parseerrors.AsFatalError(err)
	}
	raw := strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r")
	if raw == "" {
		return messages.Unparsed(time.Time{}, raw), nil
	}
	token, payload, err := cleu.SplitHeader(raw)
	if err != nil {
		return nil, err
	}
	millis, err := strconv.ParseInt(token, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parsing unix millis %q: %w", token, err)
	}
	event, fields, err := cleu.ParsePayload(payload)
	if err != nil {
		text := raw
		if len(text) > 80 {
			text = text[:80] + "..."
		}
		return nil, fmt.Errorf("empty event type in line: %q", text)
	}
	cursor := cleu.NewFields(fields)
	defer func() {
		if final == nil && cursor.Error() != nil {
			final = cursor.Error()
		}
	}()
	ts := time.UnixMilli(millis)
	if !p.lastDate.IsZero() && ts.Before(p.lastDate.Add(-time.Second)) {
		return nil, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards by %s: latest %v, current %v", ts.Sub(p.lastDate), p.lastDate, ts))
	}
	if ts.After(p.lastDate) {
		p.lastDate = ts
	}
	return p.decoder.DecodeFields(ts, event, cursor, raw)
}

// Scanner emits a final partial token before exposing a non-EOF reader error.
// FileReader intentionally rejects partial failed lines, so adapt only that
// input contract here and surface the original terminal error on next Advance.
type scannerCompatibleReader struct {
	reader io.Reader
	err    error
}

func (r *scannerCompatibleReader) Read(p []byte) (int, error) {
	if r.err != nil {
		return 0, io.EOF
	}
	n, err := r.reader.Read(p)
	if err != nil && err != io.EOF {
		r.err = err
		return n, io.EOF
	}
	return n, err
}
