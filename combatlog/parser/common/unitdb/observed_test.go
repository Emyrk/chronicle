package unitdb_test

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestObservedGUIDsForeverSleepingBag(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{nil, {database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorWoWForever}, {database.FlavorTurtle}, {database.FlavorWrath}} {
		units := unitdb.New(flavor)
		for _, entry := range []uint32{214589, 214588, 10719, 1938, 4949} {
			for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				player := guid.GUID(1)
				msg := &messages.NewOwner{Target: id, NewOwner: player}
				before := *msg
				if entry == 214589 {
					require.Contains(t, messages.ObservedGUIDs(msg), id, "shared extraction must remain flavor-independent")
				}
				observed := units.ObservedGUIDs(msg)
				ignored := (entry == 10719 || entry == 1938 || entry == 4949) && (id.IsCreature() || id.IsVehicle())
				ignored = ignored || (entry == 214589 && id.IsCreature() && flavor.Has(database.FlavorWoWForever))
				require.Equal(t, before, *msg, "summon ownership evidence must remain intact")
				require.Contains(t, observed, player)
				if ignored {
					require.NotContains(t, observed, id)
				} else {
					require.Contains(t, observed, id)
				}
			}
		}
	}
}
