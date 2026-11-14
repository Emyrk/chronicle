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
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	parservanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	nextacore "github.com/Emyrk/chronicle/combatlog/parsernext/azerothcore"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu/companion"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// NextSource independently reads ACore records. No legacy Parser is constructed.
type NextSource struct{ pipeline *NextPipeline }

// NextPipeline retains semantic decoder/companion state across complete files.
type NextPipeline struct {
	construction  *snapshot.Compatibility
	logger        *slog.Logger
	db            gamedb.GameDB
	gear          gamedb.GearResolver
	companion     *companion.Parser
	boundary      bool
	completedFile bool
	graphPending  bool
	activeSource  *NextSource
	fatal         error
	input         *scannerCompatibleReader
	reader        *common.FileReader
	decoder       *nextacore.Decoder
	synthetics    *synthetic.Synthetic
	lastDate      time.Time
	metrics       parservanilla.Metrics
}

func NewNext(ctx context.Context, logger *slog.Logger, r io.Reader, db gamedb.GameDB, gear gamedb.GearResolver) (*NextSource, error) {
	p, e := NewNextPipeline(ctx, logger, db, gear)
	if e != nil {
		return nil, e
	}
	return p.OpenFile(r)
}
func NewNextPipeline(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver) (*NextPipeline, error) {
	identity, e := acoreConstructionIdentity(ctx)
	if e != nil {
		return nil, e
	}
	meta, ok := parsectx.FromContext(ctx)
	if !ok || meta.Format != database.LogFormatAzerothcoreMod || len(meta.Flavor) == 0 {
		return nil, fmt.Errorf("explicit ACore format/flavor required")
	}
	if db == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	if logger == nil {
		logger = slog.Default()
	}
	p := &NextPipeline{construction: identity, logger: logger, db: db, gear: gear, boundary: true, metrics: parservanilla.Metrics{MatchingTime: map[string]time.Duration{}, UnmatchingTime: map[string]time.Duration{}}}
	if e := p.wireDecoder(ctx); e != nil {
		return nil, e
	}
	p.synthetics = synthetic.New(ctx, logger, db)
	return p, nil
}
func (p *NextPipeline) OpenFile(r io.Reader) (*NextSource, error) {
	if p.graphPending {
		return nil, fmt.Errorf("ACore runtime is unwired")
	}
	if p.fatal != nil {
		return nil, fmt.Errorf("ACore pipeline failed: %w", p.fatal)
	}
	if !p.boundary {
		return nil, fmt.Errorf("previous file has not completed successfully")
	}
	if r == nil {
		return nil, fmt.Errorf("source is required")
	}
	input := &scannerCompatibleReader{reader: r}
	reader, e := common.NewFileReader(input, bufio.MaxScanTokenSize-1)
	if e != nil {
		return nil, e
	}
	p.input = input
	p.reader = reader
	p.boundary = false
	source := &NextSource{pipeline: p}
	p.activeSource = source
	return source, nil
}
func (p *NextPipeline) wireDecoder(ctx context.Context) error {
	logger, gameDB, gear := p.logger, p.db, p.gear

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
	decoder, err := nextacore.NewDecoder(ctx, logger, cleu.Hooks{
		LookupSpell: lookup,
		DecodeEvent: extensions.DecodeEvent,
		DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
			if !companion.IsCompanionMessage(payload) {
				return nil, false, nil
			}
			if p.companion == nil {
				p.companion = companion.New(logger)
			}
			msgs, err := p.companion.Feed(ts, payload)
			return msgs, true, err
		},
	}, resolveGear)
	if err != nil {
		return err
	}
	p.decoder = decoder
	return nil
}

func (p *NextPipeline) Metrics() parservanilla.Metrics { return p.metrics }

// Legacy ACore's synthetic wrapper does not expose detailed timings.
func (p *NextPipeline) DetailedTimes() map[string]time.Duration { return map[string]time.Duration{} }

func (p *NextPipeline) process(ctx context.Context) ([]messages.Message, error) {
	start := time.Now()
	msgs, err := p.advance(ctx)
	p.metrics.TotalParseDuration += time.Since(start)
	if err != nil {
		return nil, err
	}
	p.metrics.TotalLinesParsed++
	msgs, err = p.synthetics.ProcessMessages(msgs)
	if err != nil {
		p.fatal = parseerrors.AsFatalError(fmt.Errorf("processing synthetics: %w", err))
		return nil, p.fatal
	}
	return msgs, nil
}

func (p *NextPipeline) advance(ctx context.Context) (_ []messages.Message, final error) {
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

func (s *NextSource) Metrics() parservanilla.Metrics          { return s.pipeline.Metrics() }
func (s *NextSource) DetailedTimes() map[string]time.Duration { return s.pipeline.DetailedTimes() }
func (s *NextSource) Advance(ctx context.Context) ([]messages.Message, error) {
	p := s.pipeline
	if p.activeSource != s {
		return nil, parseerrors.AsFatalError(fmt.Errorf("source is no longer active"))
	}
	if p.fatal != nil {
		return nil, p.fatal
	}
	if e := ctx.Err(); e != nil {
		return nil, e
	}
	if p.boundary {
		return nil, io.EOF
	}
	batch, e := p.process(ctx)
	if e == io.EOF {
		p.boundary = true
		p.completedFile = true
		p.reader = nil
		p.input = nil
	} else if parseerrors.IsFatalError(e) {
		p.fatal = e
	}
	return batch, e
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
