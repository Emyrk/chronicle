package api

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func TestIsTurtleFork(t *testing.T) {
	t.Parallel()
	require.True(t, isTurtleFork(database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}))
	require.True(t, isTurtleFork(database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorOctoWoW}), "OctoWoW runs Turtle content")
	require.False(t, isTurtleFork(database.WoWFlavor{database.FlavorVanilla, database.FlavorWoWForever}))
	require.False(t, isTurtleFork(database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}))
}
