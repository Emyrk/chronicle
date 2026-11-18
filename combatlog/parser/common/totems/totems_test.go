package totems

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func totemEntryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestIsTotemRequiresCreatureGUID(t *testing.T) {
	t.Parallel()

	const searingTotemEntry = 2523
	creature := totemEntryGUID(0xF130000000000000, searingTotemEntry)
	totem, ok := IsTotem(creature)
	require.True(t, ok)
	require.Equal(t, uint32(searingTotemEntry), totem.ID)

	for _, id := range []guid.GUID{
		totemEntryGUID(0xF140000000000000, searingTotemEntry), // Pet
		totemEntryGUID(0xF150000000000000, searingTotemEntry), // Vehicle
		totemEntryGUID(0xF110000000000000, searingTotemEntry), // Object
	} {
		_, ok := IsTotem(id)
		require.False(t, ok)
	}
}

func TestSuperiorHealingWard(t *testing.T) {
	t.Parallel()
	want := Totem{ID: 10218, Name: "Superior Healing Ward", NormalDuration: 30 * time.Second}
	ward, ok := EntryIsTotem(10218)
	require.True(t, ok)
	require.Equal(t, want, ward)
	require.Equal(t, 30*time.Second, ward.MaxDuration())
	for _, high := range []uint64{0xF130000000000000, 0xF140000000000000, 0xF150000000000000, 0xF110000000000000} {
		ward, ok := IsTotem(totemEntryGUID(high, 10218))
		require.Equal(t, high == 0xF130000000000000, ok)
		if ok {
			require.Equal(t, want, ward)
		}
	}
}

func TestVerifiedMCTotems(t *testing.T) {
	t.Parallel()
	for entry, name := range map[uint32]string{7368: "Stoneskin Totem", 15803: "Tranquil Air Totem", 7487: "Grace of Air Totem"} {
		want := Totem{ID: entry, Name: name, NormalDuration: 120 * time.Second, Modifier: modifierTotemicMastery}
		got, ok := EntryIsTotem(entry)
		require.True(t, ok)
		require.Equal(t, want, got)
		require.Equal(t, 144*time.Second, got.MaxDuration())
		for _, high := range []uint64{0xF130000000000000, 0xF140000000000000, 0xF150000000000000, 0xF110000000000000} {
			_, ok := IsTotem(totemEntryGUID(high, entry))
			require.Equal(t, high == 0xF130000000000000, ok)
		}
	}
}
