package chronicle

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParseComputeRejectsEngineBeforeInput(t *testing.T) {
	t.Parallel()
	// No Chronicle, authorization client, storage, or game DB is required to
	// enforce the explicit engine selection boundary.
	compute := &parseCompute{parserEngine: chroniclesdk.ParserEngine("unknown")}
	_, err := compute.parseCombatLog(t.Context(), database.LogFormat112aCcAddon, nil, nil, nil, nil, false, nil, "")
	require.Error(t, err)
}

func TestParseComputeLogicalInputLoader(t *testing.T) {
	t.Parallel()
	file := database.LogFile{ID: uuid.New()}
	sentinel := errors.New("input snapshot unavailable")
	for _, failure := range []bool{false, true} {
		t.Run(map[bool]string{false: "complete logical input", true: "loader failure"}[failure], func(t *testing.T) {
			t.Parallel()
			compute := &parseCompute{loadFile: func(ctx context.Context, got database.LogFile) (io.Reader, error) {
				require.Equal(t, file.ID, got.ID)
				require.Equal(t, t.Context(), ctx)
				if failure {
					return nil, sentinel
				}
				return strings.NewReader("base and ready parts"), nil
			}}
			data, err := compute.loadFileBytes(t.Context(), file)
			if failure {
				require.ErrorIs(t, err, sentinel)
				return
			}
			require.NoError(t, err)
			require.Equal(t, "base and ready parts", string(data))
		})
	}
}
