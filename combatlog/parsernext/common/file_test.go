package common_test

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/stretchr/testify/require"
)

func TestReadFile(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, input string
		lines       []common.Line
	}{
		{name: "empty"},
		{name: "exact framing", input: "first\r\n\nlast", lines: []common.Line{{Number: 1, Offset: 0, Raw: "first\r\n"}, {Number: 2, Offset: 7, Raw: "\n"}, {Number: 3, Offset: 8, Raw: "last"}}},
		{name: "terminal newline is not extra line", input: "a\n", lines: []common.Line{{Number: 1, Offset: 0, Raw: "a\n"}}},
		{name: "larger than reader buffer", input: strings.Repeat("x", 8192), lines: []common.Line{{Number: 1, Raw: strings.Repeat("x", 8192)}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var lines []common.Line
			got, err := common.ReadFile(t.Context(), strings.NewReader(tc.input), 8192, func(line common.Line) error { lines = append(lines, line); return nil })
			require.NoError(t, err)
			require.Equal(t, tc.lines, lines)
			require.Equal(t, common.FileSummary{Bytes: int64(len(tc.input)), Lines: int64(len(tc.lines)), SHA256: fmt.Sprintf("%x", sha256.Sum256([]byte(tc.input)))}, got)
		})
	}
}

// Delivers bytes together with an error, a valid Reader behavior.
type failingReader struct{ err error }

func (r failingReader) Read(p []byte) (int, error) { return copy(p, "incomplete"), r.err }

func TestReadFileFailureIsNotCompletion(t *testing.T) {
	t.Parallel()
	sentinel := errors.New("source failed")
	for _, tc := range []struct {
		name   string
		source io.Reader
		limit  int
		want   error
		visit  func(common.Line) error
	}{
		{name: "read error", source: failingReader{sentinel}, limit: 100, want: sentinel},
		{name: "visitor error", source: strings.NewReader("a\nb\n"), limit: 100, want: sentinel, visit: func(common.Line) error { return sentinel }},
		{name: "line limit includes delimiter", source: strings.NewReader("abc\n"), limit: 3, want: common.ErrLineTooLong},
		{name: "oversize unterminated line", source: strings.NewReader(strings.Repeat("x", 8193)), limit: 8192, want: common.ErrLineTooLong},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			visit := tc.visit
			if visit == nil {
				visit = func(common.Line) error { t.Fatal("invalid line must not be emitted"); return nil }
			}
			got, err := common.ReadFile(t.Context(), tc.source, tc.limit, visit)
			require.ErrorIs(t, err, tc.want)
			require.Zero(t, got)
		})
	}
}

func TestReadFileDiscardsCompletionAfterPartialProgress(t *testing.T) {
	t.Parallel()
	sentinel := errors.New("truncated source")
	var lines []common.Line
	source := io.MultiReader(strings.NewReader("complete\n"), failingReader{sentinel})
	got, err := common.ReadFile(t.Context(), source, 128, func(line common.Line) error {
		lines = append(lines, line)
		return nil
	})
	require.ErrorIs(t, err, sentinel)
	require.Zero(t, got, "provisional callbacks must not produce a completed-file summary")
	require.Equal(t, []common.Line{{Number: 1, Offset: 0, Raw: "complete\n"}}, lines)
}

func TestReadFileCancellation(t *testing.T) {
	t.Parallel()
	for _, before := range []bool{true, false} {
		t.Run(fmt.Sprint(before), func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			if before {
				cancel()
			}
			calls := 0
			got, err := common.ReadFile(ctx, strings.NewReader("last"), 100, func(common.Line) error { calls++; cancel(); return nil })
			require.ErrorIs(t, err, context.Canceled)
			require.Zero(t, got)
			if before {
				require.Zero(t, calls)
			} else {
				require.Equal(t, 1, calls)
			}
		})
	}
}

func TestReadFileInvalidArguments(t *testing.T) {
	t.Parallel()
	visit := func(common.Line) error { return nil }
	for _, tc := range []struct {
		source io.Reader
		limit  int
		visit  func(common.Line) error
	}{{nil, 1, visit}, {strings.NewReader(""), 0, visit}, {strings.NewReader(""), -1, visit}, {strings.NewReader(""), 1, nil}} {
		got, err := common.ReadFile(t.Context(), tc.source, tc.limit, tc.visit)
		require.Error(t, err)
		require.Zero(t, got)
	}
}

// A reader may return the final bytes with EOF. Do not read it again merely to
// expose completion on the next pull (or observe data outside this file).
type finalBytesReader struct{ reads int }

func (r *finalBytesReader) Read(p []byte) (int, error) { r.reads++; return copy(p, "last"), io.EOF }
func TestFileReaderDoesNotReadAfterFinalBytes(t *testing.T) {
	t.Parallel()
	input := &finalBytesReader{}
	reader, err := common.NewFileReader(input, 100)
	require.NoError(t, err)
	line, err := reader.Next(t.Context())
	require.NoError(t, err)
	require.Equal(t, "last", line.Raw)
	require.Zero(t, reader.Summary())
	_, err = reader.Next(t.Context())
	require.ErrorIs(t, err, io.EOF)
	_, err = reader.Next(t.Context())
	require.ErrorIs(t, err, io.EOF)
	require.Equal(t, 1, input.reads)
	require.EqualValues(t, 1, reader.Summary().Lines)
}
