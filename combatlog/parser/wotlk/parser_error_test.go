package wotlk

import (
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/stretchr/testify/require"
)

type permanentErrorReader struct {
	err error
}

func (r permanentErrorReader) Read([]byte) (int, error) {
	return 0, r.err
}

func TestParserMarksScannerErrorsFatal(t *testing.T) {
	t.Parallel()

	readErr := errors.New("permanent read failure")
	p, err := New(t.Context(), slog.New(slog.NewTextHandler(io.Discard, nil)), permanentErrorReader{err: readErr}, auraTestDB{}, auraTestDB{}, nil)
	require.NoError(t, err)

	_, err = p.Advance(t.Context())
	require.ErrorIs(t, err, readErr)
	require.True(t, parseerrors.IsFatalError(err))
}
