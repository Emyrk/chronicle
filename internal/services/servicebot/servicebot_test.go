package servicebot

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCloseBeforeStart(t *testing.T) {
	t.Parallel()
	require.NoError(t, (&Service{}).Close(context.Background()))
}
