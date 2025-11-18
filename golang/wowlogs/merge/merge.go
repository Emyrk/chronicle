package merge

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/chronicle/golangformat/golang/wowlogs/lines"
)

// Merger merges 2 log files
type Merger struct {
	logger *slog.Logger
}

func NewMerger(logger *slog.Logger) *Merger {
	return &Merger{
		logger: logger,
	}
}

func (m *Merger) MergeLogs(formatted io.Reader, raw io.Reader, writer io.Writer) error {
	f := bufio.NewScanner(formatted)
	r := bufio.NewScanner(raw)
	l := lines.NewLiner()

	merger, err := newInOrderMerger(l, f, r)
	if err != nil {
		return fmt.Errorf("create merger: %w", err)
	}

	for {
		ts, content, err := merger.next()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
		}

		// TODO: Omit lines that are in the Raw that are not needed in the formatted.

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
	Scanner  *repeatFirstLineScanner
	lastTS   time.Time
	lastLine string
	done     bool
}

type logLine struct {
	lastTS   time.Time
	lastLine string
}

type inOrderMerger struct {
	liner *lines.Liner
	Sets  [2]logFile
}

func newInOrderMerger(l *lines.Liner, a, b *bufio.Scanner) (*inOrderMerger, error) {
	i := &inOrderMerger{
		liner: l,
		Sets: [2]logFile{
			{Scanner: newRepeatFirstLineScanner(a)},
			{Scanner: newRepeatFirstLineScanner(b)},
		},
	}

	_, _, err := i.advance(0)
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
	if set.done {
		return time.Time{}, "", io.EOF
	}

	line, err := set.Scanner.NextLine()
	if err != nil {
		if errors.Is(err, io.EOF) {
			set.done = true
			return time.Time{}, "", io.EOF
		}
		return time.Time{}, "", fmt.Errorf("formatted read: %w", err)
	}

	nTs, nl, err := i.liner.Line(line)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("liner parse: %w", err)
	}
	set.lastTS = nTs
	set.lastLine = nl

	return nTs, nl, nil
}

type repeatFirstLineScanner struct {
	scanner   *bufio.Scanner
	firstLine string
	state     uint8
}

func newRepeatFirstLineScanner(scanner *bufio.Scanner) *repeatFirstLineScanner {
	return &repeatFirstLineScanner{
		scanner: scanner,
	}
}

func (r *repeatFirstLineScanner) NextLine() (string, error) {
	if r.state < 3 {
		r.state++
	}

	// Second pass, repeat the first
	if r.state == 2 {
		return r.firstLine, nil
	}

	if !r.scanner.Scan() {
		return "", io.EOF
	}
	// Cache the first line
	if r.state == 1 {
		txt := r.scanner.Text()
		r.firstLine = txt
		return txt, nil
	}

	// Continue as normal
	return r.scanner.Text(), nil
}
