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

func TestCoilfangGuardianKeepsTheLurkerBelowActive(t *testing.T) {
	t.Parallel()

	all := characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorTBC}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	lurkerGUID := creatureGUID(theLurkerBelowEntry)
	guardianGUID := creatureGUID(coilfangGuardianEntry)
	playerGUID := guid.GUID(1)
	start := time.Date(2026, time.August, 27, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, lurkerGUID, playerGUID))
	require.NoError(t, err)
	lurker, ok := all.Get(lurkerGUID)
	require.True(t, ok)
	require.True(t, lurker.IsActive())

	_, err = all.Process(testDamage(start.Add(50*time.Second), playerGUID, guardianGUID))
	require.NoError(t, err)

	// The Lurker Below has had no direct activity for longer than its normal
	// timeout, but the Coilfang Guardian transferred its activity bump.
	_, err = all.Process(messages.TimedOut(start.Add(90 * time.Second)))
	require.NoError(t, err)
	require.True(t, lurker.IsActive())

	_, err = all.Process(messages.TimedOut(start.Add(112 * time.Second)))
	require.NoError(t, err)
	require.False(t, lurker.IsActive())
}
