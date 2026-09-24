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

func TestFeignDeathReplacesHunterDeathsWithoutRealDeathSignals(t *testing.T) {
	t.Parallel()

	hunter := guid.GUID(1)
	at := time.Date(2026, time.September, 24, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name         string
		damageAge    *time.Duration
		damageAmount int32
	}{
		{name: "no preceding damage"},
		{name: "zero amount is not damage taken", damageAge: ptrDuration(100 * time.Millisecond)},
		{name: "damage outside real death window", damageAge: ptrDuration(501 * time.Millisecond), damageAmount: 500},
		{name: "Auriaya delay", damageAge: ptrDuration(2419 * time.Millisecond), damageAmount: 500},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			spell := &chrondbc.Spell{ID: feignDeathSpellID}
			fetcher := &feignDeathSpellFetcher{spell: spell}
			detector := newFeignDeath(context.Background(), fetcher, func(g guid.GUID) types.HeroClasses {
				if g == hunter {
					return types.HeroClassesHUNTER
				}
				return types.HeroClassesUNKNOWN
			})

			if tt.damageAge != nil {
				result, err := detector.ProcessMessages([]messages.Message{&messages.Damage{
					MessageBase: messages.Base(at.Add(-*tt.damageAge)),
					Target:      hunter,
					Amount:      tt.damageAmount,
					Overkill:    0,
				}})
				require.NoError(t, err)
				require.IsType(t, &messages.Damage{}, result[0])
			}

			result, err := detector.ProcessMessages([]messages.Message{&messages.Slain{
				MessageBase: messages.Base(at),
				Victim:      hunter,
			}})
			require.NoError(t, err)
			require.Len(t, result, 1)

			cast, ok := result[0].(*messages.SpellGo)
			require.True(t, ok)
			require.True(t, cast.IsSynthetic())
			require.Equal(t, hunter, cast.Caster)
			require.NotNil(t, cast.Target)
			require.Equal(t, hunter, *cast.Target)
			require.Same(t, spell, cast.SpellData)
			require.Equal(t, 1, fetcher.calls)
			require.Equal(t, feignDeathSpellID, fetcher.lastID)
		})
	}
}

func ptrDuration(value time.Duration) *time.Duration {
	return &value
}

func TestFeignDeathLeavesRealDeaths(t *testing.T) {
	t.Parallel()

	hunter := guid.GUID(1)
	warrior := guid.GUID(2)
	killer := guid.GUID(3)
	at := time.Date(2026, time.September, 24, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		victim   guid.GUID
		damageAt time.Time
		deathAt  time.Time
		overkill int32
		killer   *guid.GUID
	}{
		{name: "non-hunter", victim: warrior, damageAt: at, deathAt: at.Add(time.Second)},
		{name: "positive overkill", victim: hunter, damageAt: at, deathAt: at.Add(2419 * time.Millisecond), overkill: 1},
		{name: "damage at real death window boundary", victim: hunter, damageAt: at, deathAt: at.Add(500 * time.Millisecond)},
		{name: "damage within real death window", victim: hunter, damageAt: at, deathAt: at.Add(499 * time.Millisecond)},
		{name: "party kill or instakill", victim: hunter, damageAt: at, deathAt: at.Add(time.Second), killer: &killer},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			detector := newFeignDeath(context.Background(), nil, func(g guid.GUID) types.HeroClasses {
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
				Amount:      500,
				Overkill:    tt.overkill,
			}
			death := &messages.Slain{
				MessageBase: messages.Base(tt.deathAt),
				Victim:      tt.victim,
				Killer:      tt.killer,
			}
			result, err := detector.ProcessMessages([]messages.Message{damage, death})
			require.NoError(t, err)
			require.Same(t, death, result[1])
		})
	}
}
