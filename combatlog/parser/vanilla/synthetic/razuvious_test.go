package synthetic

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestRazuviousOverkillWindow(t *testing.T) {
	t.Parallel()

	razuvious, err := guid.FromString("0xF130003EBD01598C")
	require.NoError(t, err)
	understudy, err := guid.FromString("0xF1300041A327A7DB")
	require.NoError(t, err)

	deathTime := time.Date(2026, time.October, 19, 12, 45, 5, 452_000_000, time.UTC)
	processor := newRazuviousOverkill()
	processor.ProcessMessages([]messages.Message{
		&messages.Slain{
			MessageBase: messages.Base(deathTime),
			Victim:      razuvious,
		},
	})

	buggedHit := &messages.Damage{
		MessageBase: messages.Base(deathTime.Add(61*time.Second + 516*time.Millisecond)),
		Target:      understudy,
		Amount:      1_000_110,
	}
	processor.ProcessMessages([]messages.Message{buggedHit})
	require.Equal(t, int32(1), buggedHit.Amount)
	require.True(t, buggedHit.IsSynthetic())

	lateHit := &messages.Damage{
		MessageBase: messages.Base(deathTime.Add(2*time.Minute + time.Millisecond)),
		Target:      understudy,
		Amount:      20_000,
	}
	processor.ProcessMessages([]messages.Message{lateHit})
	require.Equal(t, int32(20_000), lateHit.Amount)
	require.False(t, lateHit.IsSynthetic())
}
