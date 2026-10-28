package creatures

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

func TestMalGanisFiveAuraCleanupMarksDefeat(t *testing.T) {
	t.Parallel()

	all := characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	player := guid.GUID(1)
	malGanisID := creatureGUID(26533)
	start := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      malGanisID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	cleanupAt := start.Add(50 * time.Millisecond)
	for i := range 5 {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(cleanupAt),
			Target:      malGanisID,
			SpellName:   fmt.Sprintf("Removed aura %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	malGanis, ok := all.Get(malGanisID)
	require.True(t, ok)
	require.False(t, malGanis.IsActive())
	require.Equal(t, period.EndStateSlain, malGanis.LastEndState())
	require.Equal(t, cleanupAt, malGanis.Periods()[0].End.Timestamp.Date())
}
