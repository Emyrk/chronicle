package chronicle

import (
	"errors"
	"slices"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestSlugCollisionFromLookup(t *testing.T) {
	t.Parallel()

	t.Run("existing slug collides", func(t *testing.T) {
		t.Parallel()
		collides, err := slugCollisionFromLookup(nil)
		require.NoError(t, err)
		require.True(t, collides)
	})

	t.Run("missing slug does not collide", func(t *testing.T) {
		t.Parallel()
		collides, err := slugCollisionFromLookup(pgx.ErrNoRows)
		require.NoError(t, err)
		require.False(t, collides)
	})

	t.Run("database errors are not swallowed", func(t *testing.T) {
		t.Parallel()
		lookupErr := errors.New("lookup failed")
		collides, err := slugCollisionFromLookup(lookupErr)
		require.False(t, collides)
		require.ErrorIs(t, err, lookupErr)
		require.ErrorContains(t, err, "check colliding slug")
	})
}

func TestResolveLogFlavor(t *testing.T) {
	t.Parallel()

	base := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}
	additional := database.WoWFlavor{database.FlavorAzerothcoreProgression}

	for _, tt := range []struct {
		name     string
		current  database.WoWFlavor
		explicit bool
		resolved ResolvedDataset
		want     database.WoWFlavor
		changed  bool
	}{
		{
			name:     "new log uses dataset plus tenant tags",
			resolved: ResolvedDataset{Flavor: base, AdditionalFlavor: additional},
			want:     base.Merge(additional),
			changed:  true,
		},
		{
			name:     "reparse augments persisted flavor",
			current:  base,
			explicit: true,
			resolved: ResolvedDataset{Flavor: base, AdditionalFlavor: additional},
			want:     base.Merge(additional),
			changed:  true,
		},
		{
			name:     "already resolved flavor is unchanged",
			current:  base.Merge(additional),
			explicit: true,
			resolved: ResolvedDataset{Flavor: base, AdditionalFlavor: additional},
			want:     base.Merge(additional),
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, changed := resolveLogFlavor(tt.current, tt.explicit, tt.resolved)
			if !slices.Equal(got, tt.want) {
				t.Fatalf("resolveLogFlavor() = %v, want %v", got, tt.want)
			}
			if changed != tt.changed {
				t.Fatalf("resolveLogFlavor() changed = %v, want %v", changed, tt.changed)
			}
		})
	}
}
