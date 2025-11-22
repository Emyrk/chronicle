package merge

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
)

type Scan func() (time.Time, string, error)

type MiddleWare func(ts time.Time, content string) bool
type Option func(m *Merger)

// Merger merges 2 log files and sorts by the timestamps.
// TODO: Add a parser in the middle to get rid of lines we do not want.
// Also add a parser in the middle to capture some state and log additional lines at the start
// for things like combatant info.
type Merger struct {
	logger *slog.Logger
	mw     []MiddleWare
}

func NewMerger(logger *slog.Logger, opts ...Option) *Merger {
	m := &Merger{
		logger: logger,
	}

	for _, opt := range opts {
		opt(m)
	}
	return m
}

func WithMiddleWare(mw MiddleWare) Option {
	return func(m *Merger) {
		m.mw = append(m.mw, mw)
	}
}

func (m *Merger) LineScanner(ctx context.Context, formatted io.Reader, raw io.Reader) (*lines.Liner, Scan, error) {
	f := bufio.NewScanner(formatted)
	r := bufio.NewScanner(raw)
	l := lines.NewLiner()

	merger, err := newInOrderMerger(ctx, l, f, r)
	if err != nil {
		return l, nil, fmt.Errorf("create merger: %w", err)
	}

	return l, func() (time.Time, string, error) {
	LineLoop:
		for {
			ts, content, err := merger.next()
			if err != nil {
				return time.Time{}, "", err
			}

			for _, mw := range m.mw {
				if !mw(ts, content) {
					continue LineLoop
				}
			}

			return ts, content, err
		}
	}, nil
}

func (m *Merger) MergeLogs(ctx context.Context, formatted io.Reader, raw io.Reader, writer io.Writer) error {
	l, scan, err := m.LineScanner(ctx, formatted, raw)
	if err != nil {
		return fmt.Errorf("create line scanner: %w", err)
	}

	for {
		ts, content, err := scan()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return err
		}

		serialized := l.FmtLine(ts, content) + "\n"
		n, err := writer.Write([]byte(serialized))
		if err != nil {
			return fmt.Errorf("write merged line: %w", err)
		}
		if n != len(serialized) {
			return fmt.Errorf("short write merged line: wrote %d, expected %d", n, len(serialized))
		}
	}

	return nil
}

type logFile struct {
	Scanner  *bufio.Scanner
	lastTS   time.Time
	lastLine string
	done     bool
}

type logLine struct {
	lastTS   time.Time
	lastLine string
}

type inOrderMerger struct {
	ctx   context.Context
	liner *lines.Liner
	Sets  [2]logFile

	failedLines []string
}

func newInOrderMerger(ctx context.Context, l *lines.Liner, a, b *bufio.Scanner) (*inOrderMerger, error) {
	i := &inOrderMerger{
		ctx:   ctx,
		liner: l,
		Sets: [2]logFile{
			{Scanner: a},
			{Scanner: b},
		},
	}

	var err error
	_, _, err = i.advance(0)
	if err != nil {
		return nil, fmt.Errorf("advance a: %w", err)
	}

	_, _, err = i.advance(1)
	if err != nil {
		return nil, fmt.Errorf("advance b: %w", err)
	}

	return i, nil
}

func (i *inOrderMerger) next() (time.Time, string, error) {
	a := i.Sets[0]
	b := i.Sets[1]
	if a.done && b.done {
		return time.Time{}, "", io.EOF
	}

	if a.done {
		return i.advance(1)
	}
	if b.done {
		return i.advance(0)
	}

	if a.lastTS.Before(b.lastTS) {
		return i.advance(0)
	}
	return i.advance(1)
}

func (i *inOrderMerger) advance(index int) (time.Time, string, error) {
	set := i.Sets[index]
	ts, cnt := set.lastTS, set.lastLine
	if set.done {
		return time.Time{}, "", io.EOF
	}

	var nTs time.Time
	var nl string
	var err error

	for {
		if i.ctx.Err() != nil {
			return time.Time{}, "", i.ctx.Err()
		}

		if !set.Scanner.Scan() {
			set.done = true
			set.lastTS = time.Time{}
			set.lastLine = ""
			i.Sets[index] = set
			return ts, set.lastLine, nil
		}

		line := set.Scanner.Text()
		nTs, nl, err = i.liner.Line(line)
		if err != nil {
			if errors.Is(err, io.EOF) {
				return time.Time{}, "", io.EOF
			}
			i.failedLines = append(i.failedLines, line)
			continue
		}
		break
	}
	set.lastTS = nTs
	set.lastLine = nl
	i.Sets[index] = set

	return ts, cnt, nil
}
