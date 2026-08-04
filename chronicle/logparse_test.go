package chronicle

import (
	"slices"
	"testing"

	"github.com/Emyrk/chronicle/database"
)

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
