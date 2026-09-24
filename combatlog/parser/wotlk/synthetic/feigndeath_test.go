package synthetic

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

type feignDeathSpellFetcher struct {
	spell  *chrondbc.Spell
	calls  int
	lastID chrondbc.SpellID
}

func (f *feignDeathSpellFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	f.calls++
	f.lastID = id
	return f.spell, nil
}

func (f *feignDeathSpellFetcher) SpellsByName(_ context.Context, _ string) ([]*chrondbc.Spell, error) {
	return nil, nil
}

func TestFeignDeathReplacesRecentZeroOverkillHunterDeath(t *testing.T) {
	t.Parallel()

	hunter := guid.GUID(1)
	killer := guid.GUID(2)
	at := time.Date(2026, time.September, 24, 12, 0, 0, 0, time.UTC)
	spell := &chrondbc.Spell{ID: feignDeathSpellID}
	fetcher := &feignDeathSpellFetcher{spell: spell}
	detector := NewFeignDeath(context.Background(), fetcher, func(g guid.GUID) types.HeroClasses {
		if g == hunter {
			return types.HeroClassesHUNTER
		}
		return types.HeroClassesUNKNOWN
	})

	first, err := detector.ProcessMessages([]messages.Message{&messages.Damage{
		MessageBase: messages.Base(at),
		Target:      hunter,
		Amount:      500,
		Overkill:    0,
	}})
	require.NoError(t, err)
	require.IsType(t, &messages.Damage{}, first[0])

	second, err := detector.ProcessMessages([]messages.Message{&messages.Slain{
		MessageBase: messages.Base(at.Add(time.Second)),
		Victim:      hunter,
		Killer:      &killer,
	}})
	require.NoError(t, err)
	require.Len(t, second, 1)

	cast, ok := second[0].(*messages.SpellGo)
	require.True(t, ok)
	require.True(t, cast.IsSynthetic())
	require.Equal(t, hunter, cast.Caster)
	require.NotNil(t, cast.Target)
	require.Equal(t, hunter, *cast.Target)
	require.Same(t, spell, cast.SpellData)
	require.Equal(t, 1, fetcher.calls)
	require.Equal(t, feignDeathSpellID, fetcher.lastID)
}

func TestFeignDeathLeavesRealDeaths(t *testing.T) {
	t.Parallel()

	hunter := guid.GUID(1)
	warrior := guid.GUID(2)
	at := time.Date(2026, time.September, 24, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name        string
		victim      guid.GUID
		damageAt    time.Time
		deathAt     time.Time
		overkill    int32
		killer      *guid.GUID
		damageFirst bool
	}{
		{name: "non-hunter", victim: warrior, damageAt: at, deathAt: at.Add(time.Second), damageFirst: true},
		{name: "positive overkill", victim: hunter, damageAt: at, deathAt: at.Add(time.Second), overkill: 1, damageFirst: true},
		{name: "damage older than window", victim: hunter, damageAt: at, deathAt: at.Add(time.Second + time.Millisecond), damageFirst: true},
		{name: "damage after death", victim: hunter, damageAt: at.Add(time.Millisecond), deathAt: at, damageFirst: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			detector := NewFeignDeath(context.Background(), nil, func(g guid.GUID) types.HeroClasses {
				if g == hunter {
					return types.HeroClassesHUNTER
				}
				if g == warrior {
					return types.HeroClassesWARRIOR
				}
				return types.HeroClassesUNKNOWN
			})
			damage := &messages.Damage{
				MessageBase: messages.Base(tt.damageAt),
				Target:      tt.victim,
				Overkill:    tt.overkill,
			}
			death := &messages.Slain{
				MessageBase: messages.Base(tt.deathAt),
				Victim:      tt.victim,
				Killer:      tt.killer,
			}
			batch := []messages.Message{death, damage}
			if tt.damageFirst {
				batch = []messages.Message{damage, death}
			}

			result, err := detector.ProcessMessages(batch)
			require.NoError(t, err)
			if tt.damageFirst {
				require.Same(t, death, result[1])
			} else {
				require.Same(t, death, result[0])
			}
		})
	}
}
