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
	if source == nil || visit == nil || maxLineBytes <= 0 {
		return FileSummary{}, errors.New("source, visitor and positive line byte limit are required")
	}
	reader := bufio.NewReader(source)
	digest := sha256.New()
	var summary FileSummary
	for {
		var raw []byte
		var readErr error
		for {
			if err := ctx.Err(); err != nil {
				return FileSummary{}, err
			}
			var fragment []byte
			fragment, readErr = reader.ReadSlice('\n')
			if len(fragment) > maxLineBytes-len(raw) {
				return FileSummary{}, fmt.Errorf("line %d: %w", summary.Lines+1, ErrLineTooLong)
			}
			raw = append(raw, fragment...)
			if readErr != bufio.ErrBufferFull {
				break
			}
		}
		if readErr != nil && readErr != io.EOF {
			return FileSummary{}, fmt.Errorf("read line %d: %w", summary.Lines+1, readErr)
		}
		if err := ctx.Err(); err != nil {
			return FileSummary{}, err
		}
		if len(raw) > 0 {
			line := Line{Number: summary.Lines + 1, Offset: summary.Bytes, Raw: string(raw)}
			if err := visit(line); err != nil {
				return FileSummary{}, fmt.Errorf("visit line %d: %w", line.Number, err)
			}
			_, _ = digest.Write(raw)
			summary.Bytes += int64(len(raw))
			summary.Lines++
		}
		if err := ctx.Err(); err != nil {
			return FileSummary{}, err
		}
		if readErr == io.EOF {
			summary.SHA256 = hex.EncodeToString(digest.Sum(nil))
			return summary, nil
		}
	}
}
