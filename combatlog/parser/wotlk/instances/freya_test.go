package instances

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestFreyaPostDefeatDamageDoesNotStartEncounter(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	player := guid.GUID(1)
	freya := creatureGUID(32906)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	hit := damageEvent(player, freya, 1)
	hit.MessageBase = messages.Base(start)
	require.NoError(t, instance.Process(hit))

	defeat := damageEvent(player, freya, 1)
	defeat.MessageBase = messages.Base(start.Add(time.Minute))
	defeat.Overkill = 1
	require.NoError(t, instance.Process(defeat))

	postDefeat := damageEvent(player, freya, 1)
	postDefeat.MessageBase = messages.Base(start.Add(time.Minute + 3*time.Second))
	require.NoError(t, instance.Process(postDefeat))

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, "Freya", result.Encounters[0].Name)
	require.Equal(t, start.Add(time.Minute), result.Encounters[0].Combat.End)
}

func TestNewFreyaGUIDCanStartLaterEncounter(t *testing.T) {
	t.Parallel()

	instance := newUlduarTestInstance(t)
	player := guid.GUID(1)
	firstFreya := creatureGUIDWithSeed(32906, 1)
	secondFreya := creatureGUIDWithSeed(32906, 2)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	for _, event := range []struct {
		at     time.Time
		target guid.GUID
	}{
		{at: start, target: firstFreya},
		{at: start.Add(2 * time.Minute), target: secondFreya},
	} {
		hit := damageEvent(player, event.target, 1)
		hit.MessageBase = messages.Base(event.at)
		require.NoError(t, instance.Process(hit))

		defeat := damageEvent(player, event.target, 1)
		defeat.MessageBase = messages.Base(event.at.Add(time.Minute))
		defeat.Overkill = 1
		require.NoError(t, instance.Process(defeat))
	}

	result, err := instance.Finalize(t.Context())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 2)
}
