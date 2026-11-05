package participants

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

func TestNoKnownParticipantsAlive(t *testing.T) {
	t.Parallel()

	tracker := New()
	fightID := uuid.New()
	start := time.Date(2026, time.November, 5, 3, 17, 0, 0, time.UTC)
	boss := guid.GUID(0xF13000808A000424)
	playerOne := guid.GUID(1)
	playerTwo := guid.GUID(2)

	require.False(t, tracker.NoKnownParticipantsAlive())

	pull := &messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &playerOne,
		Target:      boss,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}
	tracker.FightStarted(fightID, pull)
	require.NoError(t, tracker.ProcessMessage(true, fightID, pull))
	require.False(t, tracker.NoKnownParticipantsAlive())

	require.NoError(t, tracker.ProcessMessage(true, fightID, &messages.Slain{
		MessageBase: messages.Base(start.Add(time.Second)),
		Victim:      playerOne,
	}))
	require.True(t, tracker.NoKnownParticipantsAlive())

	require.NoError(t, tracker.ProcessMessage(true, fightID, &messages.Heal{
		MessageBase: messages.Base(start.Add(2 * time.Second)),
		Caster:      playerTwo,
		Target:      playerTwo,
		Amount:      1,
	}))
	require.False(t, tracker.NoKnownParticipantsAlive())

	require.NoError(t, tracker.ProcessMessage(true, fightID, &messages.Damage{
		MessageBase: messages.Base(start.Add(3 * time.Second)),
		Caster:      &boss,
		Target:      playerTwo,
		Amount:      100,
		Overkill:    1,
		HitType:     types.HitTypeHit,
	}))
	require.True(t, tracker.NoKnownParticipantsAlive())

	require.NoError(t, tracker.ProcessMessage(true, fightID, &messages.Resurrection{
		MessageBase: messages.Base(start.Add(4 * time.Second)),
		Source:      playerTwo,
		Target:      playerOne,
	}))
	require.False(t, tracker.NoKnownParticipantsAlive())
}

func TestNoKnownParticipantsAliveResetsBetweenFights(t *testing.T) {
	t.Parallel()

	tracker := New()
	player := guid.GUID(1)
	boss := guid.GUID(0xF13000808A000424)
	start := time.Date(2026, time.November, 5, 3, 17, 0, 0, time.UTC)

	firstFight := uuid.New()
	tracker.FightStarted(firstFight, &messages.Slain{
		MessageBase: messages.Base(start),
		Victim:      player,
	})
	require.True(t, tracker.NoKnownParticipantsAlive())
	tracker.FightEnded(firstFight, messages.TimedOut(start.Add(time.Second)))
	require.False(t, tracker.NoKnownParticipantsAlive())

	tracker.FightStarted(uuid.New(), &messages.Damage{
		MessageBase: messages.Base(start.Add(time.Minute)),
		Caster:      &player,
		Target:      boss,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.False(t, tracker.NoKnownParticipantsAlive())
}
