package logscanner

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestScannerSkipsLargeNULPadding(t *testing.T) {
	t.Parallel()

	input := "first\n" + strings.Repeat("\x00", 1<<20) + "second\nthird"
	scanner := New(strings.NewReader(input))

	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	require.NoError(t, scanner.Err())
	require.Equal(t, []string{"first", "second", "third"}, lines)
}

func TestScannerIgnoresNULOnlyInput(t *testing.T) {
	t.Parallel()

	scanner := New(strings.NewReader(strings.Repeat("\x00", 1<<20)))
	require.False(t, scanner.Scan())
	require.NoError(t, scanner.Err())
}
