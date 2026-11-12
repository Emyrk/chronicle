package synthetic

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/stretchr/testify/require"
)

func TestSlainDetectiveNoPriorDamage(t *testing.T) {
	t.Parallel()
	detective := NewSlainDetective()
	for _, killer := range []*guid.GUID{nil, ptrGUID(10)} {
		slain := &messages.Slain{Victim: 2, Killer: killer}
		detective.ProcessMessage(slain)
		// require.Nil also accepts typed-nil pointers inside interfaces. Check the
		// interface itself so this catches the original missing-map-value bug.
		require.True(t, slain.Attribution == nil)
		require.Same(t, killer, slain.Killer)
	}
}

func TestSlainDetectiveKnownDamage(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name           string
		caster, killer *guid.GUID
		attributed     bool
	}{
		{"infer killer", ptrGUID(1), nil, true},
		{"matching killer", ptrGUID(1), ptrGUID(1), true},
		{"different killer", ptrGUID(1), ptrGUID(3), false},
		{"environment damage", nil, nil, true},
		{"known killer without caster", nil, ptrGUID(3), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			detective := NewSlainDetective()
			damage := &messages.Damage{Target: 2, Caster: tc.caster, Amount: 100}
			slain := &messages.Slain{Victim: 2, Killer: tc.killer}
			detective.ProcessMessages([]messages.Message{damage, slain})
			if tc.attributed {
				require.Same(t, damage, slain.Attribution)
			} else {
				require.True(t, slain.Attribution == nil)
			}
			expectedKiller := tc.killer
			if expectedKiller == nil {
				expectedKiller = tc.caster
			}
			require.Equal(t, expectedKiller, slain.Killer)
		})
	}
}

func TestSlainDetectiveZoneReset(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	location := func(name string) *messages.Zone {
		return &messages.Zone{MessageBase: messages.Base(at), Zone: zone.Zone{Name: name, MapID: 1, InstanceID: 4, InstanceType: "raid", IsInstance: true}}
	}
	detective := NewSlainDetective()
	detective.ProcessMessage(location("First"))
	damage := &messages.Damage{Target: 2, Caster: ptrGUID(1)}
	detective.ProcessMessage(damage)
	detective.ProcessMessage(location("First"))
	sameZone := &messages.Slain{Victim: 2}
	detective.ProcessMessage(sameZone)
	require.Same(t, damage, sameZone.Attribution)
	detective.ProcessMessage(location("Second"))
	afterReset := &messages.Slain{Victim: 2}
	detective.ProcessMessage(afterReset)
	require.True(t, afterReset.Attribution == nil)
	require.Nil(t, afterReset.Killer)
	detective.ProcessMessage(damage)
	fresh := &messages.Slain{Victim: 2}
	detective.ProcessMessage(fresh)
	require.Same(t, damage, fresh.Attribution)
}
func ptrGUID(id guid.GUID) *guid.GUID { return &id }
