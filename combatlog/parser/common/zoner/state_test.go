package zoner

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/stretchr/testify/require"
)

func TestLocationStateDetachedOrigin(t *testing.T) {
	t.Parallel()
	for _, origin := range []*bool{nil, new(bool), func() *bool { v := true; return &v }()} {
		l := &Location{synthetic: origin, Zone: zone.Zone{Seen: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Name: "Raid", MapID: 2, InstanceID: 3, Ghost: true, InstanceType: "raid", IsInstance: true, DifficultyIndex: 1, DifficultyName: "normal", MaxPlayers: 40, DynamicDifficulty: 1, SubZone: "wing"}}
		s := l.CaptureState()
		b, err := s.Encode()
		require.NoError(t, err)
		decoded, err := DecodeState(1, b)
		require.NoError(t, err)
		restored := decoded.Restore()
		require.Equal(t, l, restored)
		l.Process(messages.Zone{Zone: zone.Zone{Name: "Other"}})
		restored.Process(messages.Zone{Zone: zone.Zone{Name: "New"}})
		again, err := s.Encode()
		require.NoError(t, err)
		require.Equal(t, b, again)
		again, err = decoded.Encode()
		require.NoError(t, err)
		require.Equal(t, b, again)
	}
}
