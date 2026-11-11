package synthetic

import (
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func razStateBytes(t *testing.T, s RazuviousState) []byte {
	t.Helper()
	b, err := s.Encode()
	require.NoError(t, err)
	return b
}

func razRecords() []messages.Message {
	ts := time.Date(2026, time.October, 19, 12, 45, 5, 452000000, time.UTC)
	raz := guid.GUID(0xF130003EBD01598C)
	target := guid.GUID(0xF1300041A327A7DB)
	damage := func(offset time.Duration, amount int32) *messages.Damage {
		return &messages.Damage{MessageBase: messages.Base(ts.Add(offset)), Target: target, Amount: amount}
	}
	return []messages.Message{
		damage(0, 20000), &messages.Slain{MessageBase: messages.Base(ts), Victim: raz},
		damage(-time.Second, 20000), damage(time.Second, 10000), damage(2*time.Minute, 10001),
		damage(2*time.Minute+time.Millisecond, 20000), damage(time.Second, 20000),
		&messages.Slain{MessageBase: messages.Base(ts), Victim: target}, damage(time.Second, 20000),
		&messages.Slain{MessageBase: messages.Base(ts), Victim: raz}, damage(time.Second, 30000),
	}
}

func TestRazuviousStateResume(t *testing.T) {
	t.Parallel()
	for split := 0; split <= len(razRecords()); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := NewRazuviousOverkill()
			original, restoredMessages := razRecords(), razRecords()
			continuous.ProcessMessages(original[:split])
			captured := continuous.CaptureState()
			before := razStateBytes(t, captured)
			decoded, err := DecodeRazuviousState(1, before)
			require.NoError(t, err)
			restored, err := decoded.Restore()
			require.NoError(t, err)
			continuous.ProcessMessages(original[split:])
			restored.ProcessMessages(restoredMessages[split:])
			require.Equal(t, original[split:], restoredMessages[split:])
			require.Equal(t, razStateBytes(t, continuous.CaptureState()), razStateBytes(t, restored.CaptureState()))
			require.Equal(t, before, razStateBytes(t, captured))
			require.Equal(t, before, razStateBytes(t, decoded))
		})
	}
}

func TestRazuviousStatePreservesZeroAndExpiredTime(t *testing.T) {
	t.Parallel()
	r := NewRazuviousOverkill()
	r.ProcessMessages([]messages.Message{&messages.Slain{MessageBase: messages.Base(time.Time{}), Victim: guid.GUID(0xF130003EBD01598C)}})
	captured := r.CaptureState()
	before := razStateBytes(t, captured)
	decoded, err := DecodeRazuviousState(1, before)
	require.NoError(t, err)
	one, err := decoded.Restore()
	require.NoError(t, err)
	two, err := decoded.Restore()
	require.NoError(t, err)
	require.NotZero(t, one.raz)
	require.True(t, one.lastSlain.IsZero())
	// No eager expiry at capture/restore. An unrelated non-damage message also
	// cannot clear state; only Damage triggers the existing expiration rule.
	one.ProcessMessages([]messages.Message{&messages.Slain{MessageBase: messages.Base(time.UnixMilli(1000)), Victim: 1}})
	require.Equal(t, before, razStateBytes(t, one.CaptureState()))
	one.ProcessMessages([]messages.Message{&messages.Damage{MessageBase: messages.Base(time.UnixMilli(1000))}})
	require.Zero(t, one.raz)
	require.True(t, one.lastSlain.IsZero())
	require.Equal(t, before, razStateBytes(t, two.CaptureState()))
	require.Equal(t, before, razStateBytes(t, captured))
}

func TestRazuviousStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	valid := razStateBytes(t, RazuviousState{})
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeRazuviousState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}",
		`{"last_slain":"0001-01-01T00:00:00Z","razuvious":"0x0000000000000000","unknown":true}`,
		`{"last_slain":"bad","razuvious":"0x0000000000000000"}`,
		`{"last_slain":null,"razuvious":"0x0000000000000000"}`,
		`{"last_slain":"0001-01-01T00:00:00Z","razuvious":null}`,
		`{"last_slain":"0001-01-01T00:00:00Z","razuvious":"0x0000000000000001"}`,
		`{"last_slain":"2026-01-01T00:00:00Z","razuvious":"0x0000000000000000"}`,
	} {
		_, err := DecodeRazuviousState(1, []byte(payload))
		require.Error(t, err, payload)
	}
	restored, err := (RazuviousState{raz: 1}).Restore()
	require.Error(t, err)
	require.Nil(t, restored)
}
