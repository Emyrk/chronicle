// Package common owns expansion-independent source ingestion contracts.
// It does not select expansion policies or construct raids/encounters.
package common

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
)

// Expansion identifies explicit composition policy, not an inferred wire format.
type Expansion string

// Line is one physical source line. Raw preserves every byte, including CRLF or
// LF terminators, and may safely be retained by the visitor. No timestamp, CSV,
// companion-frame or combat-event interpretation has occurred.
type Line struct {
	Number int64 // One-based physical line number.
	Offset int64 // Zero-based byte offset in the supplied uncompressed source.
	Raw    string
}

// FileSummary is available only after successful EOF and all visitor calls.
// It certifies complete source ingestion, not validity as a combat log.
type FileSummary struct {
	Bytes  int64
	Lines  int64
	SHA256 string
}

var ErrLineTooLong = errors.New("source line exceeds byte limit")

// ReadFile consumes exactly one complete, already-decompressed source. The
// caller owns the reader and any cancellation needed to interrupt a blocked
// Read. The visitor receives provisional lines: on cancellation/read/visitor
// failure, the summary is zero and the caller must discard derived state.
// maxLineBytes includes the line terminator and must be positive.
func ReadFile(ctx context.Context, source io.Reader, maxLineBytes int, visit func(Line) error) (FileSummary, error) {
	if visit == nil {
		return FileSummary{}, errors.New("visitor is required")
	}
	reader, err := NewFileReader(source, maxLineBytes)
	if err != nil {
		return FileSummary{}, err
	}
	for {
		line, err := reader.Next(ctx)
		if err == io.EOF {
			return reader.Summary(), nil
		}
		if err != nil {
			return FileSummary{}, err
		}
		if err := visit(line); err != nil {
			return FileSummary{}, fmt.Errorf("visit line %d: %w", line.Number, err)
		}
	}
}

// FileReader pulls owned physical lines from one complete source. It never reads
// another source. A new reader is required for each file; callers own its input.
// Read errors are sticky. Summary is available only after Next returns clean EOF.
type FileReader struct {
	reader       *bufio.Reader
	maxLineBytes int
	digest       hash.Hash
	summary      FileSummary
	terminal     error
	eofPending   bool
}

func NewFileReader(source io.Reader, maxLineBytes int) (*FileReader, error) {
	if source == nil || maxLineBytes <= 0 {
		return nil, errors.New("source and positive line byte limit are required")
	}
	return &FileReader{reader: bufio.NewReader(source), maxLineBytes: maxLineBytes, digest: sha256.New()}, nil
}

func (r *FileReader) Summary() FileSummary {
	if r.terminal != io.EOF {
		return FileSummary{}
	}
	return r.summary
}

func (r *FileReader) Next(ctx context.Context) (Line, error) {
	if r.terminal != nil {
		return Line{}, r.terminal
	}
	line, err := r.next(ctx)
	if err != nil {
		r.terminal = err
		if err == io.EOF {
			r.summary.SHA256 = hex.EncodeToString(r.digest.Sum(nil))
		}
	}
	return line, err
}

func (r *FileReader) next(ctx context.Context) (Line, error) {
	if err := ctx.Err(); err != nil {
		return Line{}, err
	}
	if r.eofPending {
		return Line{}, io.EOF
	}
	var raw []byte
	var readErr error
	for {
		if err := ctx.Err(); err != nil {
			return Line{}, err
		}
		var fragment []byte
		fragment, readErr = r.reader.ReadSlice('\n')
		if len(fragment) > r.maxLineBytes-len(raw) {
			return Line{}, fmt.Errorf("line %d: %w", r.summary.Lines+1, ErrLineTooLong)
		}
		raw = append(raw, fragment...)
		if readErr != bufio.ErrBufferFull {
			break
		}
	}
	if readErr != nil && readErr != io.EOF {
		return Line{}, fmt.Errorf("read line %d: %w", r.summary.Lines+1, readErr)
	}
	if err := ctx.Err(); err != nil {
		return Line{}, err
	}
	if len(raw) == 0 && readErr == io.EOF {
		return Line{}, io.EOF
	}
	r.eofPending = readErr == io.EOF
	line := Line{Number: r.summary.Lines + 1, Offset: r.summary.Bytes, Raw: string(raw)}
	_, _ = r.digest.Write(raw)
	r.summary.Bytes += int64(len(raw))
	r.summary.Lines++
	return line, nil
}
