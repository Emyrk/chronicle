package instances

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestCommonFactoryCopiesCategoryToDynamicInstance(t *testing.T) {
	t.Parallel()

	factory := &CommonFactory{
		Name:     "Static Name",
		Category: InstanceCategoryRaid,
		NameFromZone: func(context.Context, zone.Zone, database.WoWFlavor) string {
			return "Zone-Derived Name"
		},
		DerivedName: func(database.WoWFlavor) *MultiInstanceZone {
			return NewMultiInstanceZone(map[string][]uint32{"Fight-Derived Name": {1}})
		},
		Hostiles: func(database.WoWFlavor) *identifier.Identifier {
			return identifier.NewIdentifier(map[uint32]identifier.Identity{})
		},
	}

	instance := factory.New(context.Background(), slog.Default(), unitdb.New(), zone.Zone{}, database.WoWFlavor{})
	require.Equal(t, InstanceCategoryRaid, instance.Category)
	require.Equal(t, "Zone-Derived Name", instance.Name())

	instance.derivedName.cachedOverride = "Fight-Derived Name"
	require.Equal(t, "Fight-Derived Name", instance.Name())
	require.Equal(t, InstanceCategoryRaid, instance.Category)
}
