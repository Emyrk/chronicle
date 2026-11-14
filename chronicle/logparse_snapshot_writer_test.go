package chronicle

import (
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Implement io.WriteCloser so tests prove Snapshot owns only Write, even when the
// caller's writer also offers Close. State is per test, never a package override.
type snapshotWriterSpy struct {
	write  func([]byte) (int, error)
	close  func() error
	closes int
}

func (w *snapshotWriterSpy) Write(p []byte) (int, error) { return w.write(p) }
func (w *snapshotWriterSpy) Close() error {
	w.closes++
	if w.close != nil {
		return w.close()
	}
	return nil
}

func TestSnapshotWriterGzipRoundtrip(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, true)
	original, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, original.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	writer := &snapshotWriterSpy{write: gz.Write, close: gz.Close}
	require.NoError(t, original.Snapshot(writer))
	require.Zero(t, writer.closes, "Snapshot must not close caller compression")
	require.NoError(t, original.usable(), "serialization does not finalize or acknowledge persistence")
	// Only the caller finishes the gzip member and decides whether/how to commit.
	require.NoError(t, writer.Close())
	require.Equal(t, 1, writer.closes)
	reader, err := gzip.NewReader(bytes.NewReader(compressed.Bytes()))
	require.NoError(t, err)
	defer func() { require.NoError(t, reader.Close()) }()
	restored, err := RestoreCompleteFileSession(reader, futureSessionOptions(opts, 1))
	require.NoError(t, err)
	require.NoError(t, restored.WireRuntime(ctx))
	require.NoError(t, original.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
	require.NoError(t, restored.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
	want, err := original.Finalize(ctx)
	require.NoError(t, err)
	got, err := restored.Finalize(ctx)
	require.NoError(t, err)
	require.Equal(t, want, got)
	require.Equal(t, normalizedExpansionEvents(t, original, want), normalizedExpansionEvents(t, restored, got))
}

func TestSnapshotWriterSuccessDoesNotCommitOrClose(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, false)
	s, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, s.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	// Discard is a successful serializer sink, not a durable checkpoint.
	require.NoError(t, s.Snapshot(io.Discard))
	var first, second bytes.Buffer
	writer := &snapshotWriterSpy{write: first.Write, close: func() error { return errors.New("caller close failure") }}
	require.NoError(t, s.Snapshot(writer))
	require.Zero(t, writer.closes)
	require.NoError(t, s.Snapshot(&second))
	require.Equal(t, first.Bytes(), second.Bytes())
	require.NoError(t, s.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
	_, err = s.Finalize(ctx)
	require.NoError(t, err)
	require.Error(t, s.Snapshot(io.Discard))
}

func TestSnapshotWriterFailureInvalidates(t *testing.T) {
	t.Parallel()
	for _, mode := range []string{"short", "error", "partial-error", "nil"} {
		t.Run(mode, func(t *testing.T) {
			t.Parallel()
			ctx, opts, inputs := completeSessionFixture(t, false)
			s, err := NewCompleteFileSession(ctx, opts)
			require.NoError(t, err)
			require.NoError(t, s.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
			injected := errors.New("writer failure")
			var partial bytes.Buffer
			writer := &snapshotWriterSpy{write: func(p []byte) (int, error) {
				switch mode {
				case "short":
					return partial.Write(p[:len(p)/2])
				case "partial-error":
					n, e := partial.Write(p[:len(p)/2])
					require.NoError(t, e)
					return n, injected
				default:
					return 0, injected
				}
			}}
			if mode == "nil" {
				err = s.Snapshot(nil)
			} else {
				err = s.Snapshot(writer)
			}
			require.Error(t, err)
			if mode == "short" {
				require.ErrorIs(t, err, io.ErrShortWrite)
			} else if mode != "nil" {
				require.ErrorIs(t, err, injected)
			}
			require.Zero(t, writer.closes, "failure does not transfer writer ownership")
			require.Error(t, s.Snapshot(io.Discard))
			require.Error(t, s.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
			_, err = s.Finalize(ctx)
			require.Error(t, err)
		})
	}
}
