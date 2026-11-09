package instances

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGnomereganHostiles_ChomperIsNotBoss(t *testing.T) {
	t.Parallel()

	chomper := GnomereganHostiles()[6215]
	require.Equal(t, "Chomper", chomper.Name)
	require.False(t, chomper.Boss)
	require.True(t, chomper.CanBattle())
}
