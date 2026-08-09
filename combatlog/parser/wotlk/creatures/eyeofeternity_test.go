package creatures

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func TestMalygosRemainsActiveDuringPhaseTwo(t *testing.T) {
	t.Parallel()

	all := characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	malygosGUID := creatureGUID(malygosEntry)
	playerGUID := guid.GUID(1)
	start := time.Date(2026, time.August, 5, 23, 27, 44, 0, time.UTC)

	_, err := all.Process(testDamage(start, malygosGUID, playerGUID))
	require.NoError(t, err)
	malygos, ok := all.Get(malygosGUID)
	require.True(t, ok)
	require.True(t, malygos.IsActive())

	for i, entry := range []uint32{nexusLordEntry, scionOfEternityEntry} {
		ts := start.Add(time.Duration(50+i) * time.Second)
		_, err := all.Process(testDamage(ts, playerGUID, creatureGUID(entry)))
		require.NoError(t, err)
	}

	// Malygos has been inactive for more than its normal timeout, but the
	// phase-two adds bumped him when their own activity started.
	_, err = all.Process(messages.TimedOut(start.Add(90 * time.Second)))
	require.NoError(t, err)
	require.True(t, malygos.IsActive())

	_, err = all.Process(messages.TimedOut(start.Add(112 * time.Second)))
	require.NoError(t, err)
	require.False(t, malygos.IsActive())
}

func testDamage(ts time.Time, caster, target guid.GUID) *messages.Damage {
	return &messages.Damage{
		MessageBase: messages.Base(ts),
		Caster:      &caster,
		Target:      target,
		Amount:      1,
	}
}

func creatureGUID(entry uint32) guid.GUID {
	return guid.GUID(0xF130000000000001 | uint64(entry)<<24)
}

func TestNewVortexNeverBecomesActive(t *testing.T) {
	t.Parallel()

	vortexGUID := guid.GUID(0xF150000000000001 | uint64(30090)<<24)
	vortex, ok := NewVortex(vortexGUID, nil)
	require.True(t, ok)
	require.Equal(t, vortexGUID, vortex.ID())
	require.False(t, vortex.IsActive())
	require.Empty(t, vortex.Periods())
}

func TestNewVortexRejectsInvalidGUIDs(t *testing.T) {
	t.Parallel()

	for _, id := range []guid.GUID{
		guid.GUID(0xF130000000000001 | uint64(28859)<<24), // Other entry.
		guid.GUID(0xF130000000000001 | uint64(30090)<<24), // Vortex entry with creature type.
	} {
		vortex, ok := NewVortex(id, nil)
		require.False(t, ok)
		require.Nil(t, vortex)
	}
}
