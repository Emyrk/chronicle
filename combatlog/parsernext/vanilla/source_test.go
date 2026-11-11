package vanilla_test

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/stretchr/testify/require"
)

const header = "0|HEADER|0x0000000000000001|Test Realm|Test Zone|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05"

func TestSourceFileBoundaryAndSingleClock(t *testing.T) {
	t.Parallel()
	d := vanilla.NewDecoder(nil, "")
	first, err := vanilla.NewSource(strings.NewReader(header), 4096, d)
	require.NoError(t, err)
	batch, err := first.Advance(t.Context())
	require.NoError(t, err)
	require.Len(t, batch, 2)
	require.Zero(t, first.Summary())
	state := d.State()
	require.True(t, state.LastTimestamp().IsZero())
	batch, err = first.Advance(t.Context())
	require.ErrorIs(t, err, io.EOF)
	require.Empty(t, batch)
	require.EqualValues(t, 1, first.Summary().Lines)
	input := "10000|DEATH|0x0000000000000001\r\n9000|COMBAT_END"
	second, err := vanilla.NewSource(strings.NewReader(input), 4096, d)
	require.NoError(t, err)
	batch, err = second.Advance(t.Context())
	require.NoError(t, err)
	require.Len(t, batch, 1)
	batch, err = second.Advance(t.Context())
	require.NoError(t, err)
	require.Equal(t, time.UnixMilli(9000), batch[0].Date())
	require.IsType(t, &messages.UnparsedLine{}, batch[0])
	require.Zero(t, second.Summary())
	batch, err = second.Advance(t.Context())
	require.ErrorIs(t, err, io.EOF)
	require.Empty(t, batch)
	require.Equal(t, common.FileSummary{Bytes: int64(len(input)), Lines: 2, SHA256: fmt.Sprintf("%x", sha256.Sum256([]byte(input)))}, second.Summary())
	third, err := vanilla.NewSource(strings.NewReader("7999|COMBAT_END"), 4096, d)
	require.NoError(t, err)
	_, err = third.Advance(t.Context())
	require.True(t, parseerrors.IsFatalError(err))
	require.Zero(t, third.Summary())
}

type failedReader struct{}

var errRead = errors.New("broken input")

func (failedReader) Read(p []byte) (int, error) { return copy(p, "partial"), errRead }

func TestSourceReadErrorsAreFatalAndSticky(t *testing.T) {
	t.Parallel()
	for _, input := range []io.Reader{failedReader{}, strings.NewReader(strings.Repeat("x", 101))} {
		source, err := vanilla.NewSource(input, 100, vanilla.NewDecoder(nil, ""))
		require.NoError(t, err)
		_, err = source.Advance(t.Context())
		require.True(t, parseerrors.IsFatalError(err))
		require.NotErrorIs(t, err, io.EOF)
		_, again := source.Advance(t.Context())
		require.Equal(t, err, again)
		require.Zero(t, source.Summary())
	}
}

func TestSourceMalformedRecordsRecoverButCancellationDoesNotComplete(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	source, err := vanilla.NewSource(strings.NewReader("bad|DEATH|bad\n10000|COMBAT_END"), 4096, vanilla.NewDecoder(nil, ""))
	require.NoError(t, err)
	_, err = source.Advance(ctx)
	require.Error(t, err)
	require.False(t, parseerrors.IsFatalError(err))
	batch, err := source.Advance(ctx)
	require.NoError(t, err)
	require.Len(t, batch, 1)
	cancel()
	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, context.Canceled)
	require.True(t, parseerrors.IsFatalError(err))
	require.Zero(t, source.Summary())
}
