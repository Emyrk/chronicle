package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInstanceBuilderCategories(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	boss := guid.GUID(0xF13000007B000001)
	ordinary := guid.GUID(0xF13000007C000001)
	player := guid.GUID(1)
	units.Info[boss] = unitinfo.Info{Name: "Boss"}
	builder := newInstanceBuilder(units, uuid.New())
	builder.categories = map[guid.GUID]unitdb.Category{boss: unitdb.CategoryOrdinary}
	builder.seen(boss, ordinary, player, boss)
	require.Len(t, builder.units, 2)
	require.Equal(t, "ordinary", builder.units[0].Category)
	require.Equal(t, string(units.Category(ordinary)), builder.units[1].Category)
	require.NotEmpty(t, builder.units[1].Category)
	require.Len(t, builder.players, 1)
	require.Equal(t, player, builder.players[0].UnitGuid)
}
