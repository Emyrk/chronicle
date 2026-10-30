package api

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func TestLuaProjectFlavor(t *testing.T) {
	t.Parallel()
	turtle := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorTurtle}

	t.Run("CanonicalOrder", func(t *testing.T) {
		t.Parallel()
		flavor, message := luaProjectFlavor(nil, []string{"nightmare-of-ursol", "vanilla", "vanilla"}, turtle)
		require.Empty(t, message)
		require.Equal(t, []string{"vanilla", "nightmare-of-ursol"}, flavor)
	})

	t.Run("UnknownTag", func(t *testing.T) {
		t.Parallel()
		_, message := luaProjectFlavor(nil, []string{"turtle"}, turtle)
		require.NotEmpty(t, message)
	})

	t.Run("CannotAddOtherSiteTag", func(t *testing.T) {
		t.Parallel()
		_, message := luaProjectFlavor(nil, []string{"wrath"}, turtle)
		require.NotEmpty(t, message)
	})

	t.Run("CannotRemoveOtherSiteTag", func(t *testing.T) {
		t.Parallel()
		_, message := luaProjectFlavor([]string{"wrath"}, []string{}, turtle)
		require.NotEmpty(t, message)
	})

	t.Run("KeepsOtherSiteTag", func(t *testing.T) {
		t.Parallel()
		flavor, message := luaProjectFlavor([]string{"wrath"}, []string{"vanilla", "wrath"}, turtle)
		require.Empty(t, message)
		require.Equal(t, []string{"vanilla", "wrath"}, flavor)
	})

	t.Run("FitsSite", func(t *testing.T) {
		t.Parallel()
		require.True(t, luaProjectFitsSite(database.LuaProject{}, turtle))
		require.True(t, luaProjectFitsSite(database.LuaProject{Flavor: []string{"vanilla", "nightmare-of-ursol"}}, turtle))
		require.False(t, luaProjectFitsSite(database.LuaProject{Flavor: []string{"vanilla", "wrath"}}, turtle))
	})
}
