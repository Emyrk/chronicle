package instances

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestFinalizeIgnoresRemoteBuffNPCsAcrossFlavors(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{}, {database.FlavorWoWForever}, {database.FlavorVanilla}, {database.FlavorNightmareOfUrsol}, {database.FlavorTurtle}, {database.FlavorWrath}, {database.FlavorVanillaPlus}} {
		units := unitdb.New(flavor)
		ctx := parsectx.With(t.Context(), parsectx.Context{Flavor: flavor})
		h := NewHookable(ctx, slog.Default(), units, zone.Zone{Name: "ragefire chasm", MapID: 389}, InstanceParams{Name: "Ragefire Chasm", Idf: RagefireChasmFactory.Hostiles(flavor)})
		now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		player := guid.GUID(1)
		for _, entry := range []uint32{10719, 1938, 4949} {
			for _, high := range []uint64{0xF130000000000000, 0xF150000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				aura := &messages.Aura{MessageBase: messages.Base(now), Source: &id, Target: player, SpellName: "World buff", Amount: 1}
				for _, msg := range []messages.Message{
					&messages.Unit{MessageBase: messages.Base(now), Info: unitinfo.Info{Guid: id}},
					aura,
					&messages.Aura{MessageBase: messages.Base(now), Source: &player, Target: id, SpellName: "World buff", Amount: 1},
					&messages.Unit{MessageBase: messages.Base(now), Info: unitinfo.Info{Guid: player, Owner: &id}},
				} {
					require.NoError(t, h.Process(msg))
				}
				require.Equal(t, id, *aura.Source)
				require.Equal(t, []guid.GUID{id, player}, aura.Affects())
			}
		}
		result, err := h.Finalize(ctx)
		require.NoError(t, err)
		require.Equal(t, []guid.GUID{player}, result.PersistedUnits)
		require.Equal(t, map[guid.GUID]unitdb.Category{player: unitdb.CategoryPlayer}, result.UnitCategories)
		require.Empty(t, result.UnknownUnits)
	}
}

func TestFinalizeIgnoresOnlyForeverSleepingBagCreature(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{nil, {database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorWoWForever}, {database.FlavorTurtle}, {database.FlavorWrath}} {
		units := unitdb.New(flavor)
		ctx := parsectx.With(t.Context(), parsectx.Context{Flavor: flavor})
		h := NewHookable(ctx, slog.Default(), units, zone.Zone{Name: "blackfathom deeps", MapID: 48}, InstanceParams{Name: "Blackfathom Deeps", Idf: BlackfathomDeepsFactory.Hostiles(flavor)})
		now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		player := guid.GUID(1)
		for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
			id := guid.GUID(high | uint64(214589)<<24 | 1)
			require.NoError(t, h.Process(&messages.Unit{MessageBase: messages.Base(now), Info: unitinfo.Info{Guid: id, Name: "Cozy Sleeping Bag"}}))
			summon := &messages.NewOwner{MessageBase: messages.Base(now), Target: id, NewOwner: player}
			before := *summon
			require.NoError(t, h.Process(summon))
			require.Equal(t, before, *summon)
		}
		minion := creatureGUID(8996, 1)
		require.NoError(t, h.Process(&messages.Unit{MessageBase: messages.Base(now), Info: unitinfo.Info{Guid: minion}}))
		result, err := h.Finalize(ctx)
		require.NoError(t, err)
		require.Contains(t, result.PersistedUnits, minion)
		require.Equal(t, unitdb.CategoryOrdinary, result.UnitCategories[minion])
		for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
			id := guid.GUID(high | uint64(214589)<<24 | 1)
			if id.IsCreature() && flavor.Has(database.FlavorWoWForever) {
				require.NotContains(t, result.PersistedUnits, id)
				require.NotContains(t, result.UnitCategories, id)
				require.NotContains(t, result.UnknownUnits[214589].Samples, id)
			} else {
				require.Contains(t, result.PersistedUnits, id)
				want := unitdb.CategoryUnknown
				if id.IsPet() {
					want = unitdb.CategoryPet
				}
				if id.IsObject() && flavor.Has(database.FlavorWoWForever) {
					want = unitdb.CategoryObject
				}
				require.Equal(t, want, result.UnitCategories[id])
			}
		}
	}
}
