package synthetic

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	wotlksynthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

type spellFetcher struct {
	spell *chrondbc.Spell
}

func (f spellFetcher) Spell(_ context.Context, _ chrondbc.SpellID) (*chrondbc.Spell, error) {
	return f.spell, nil
}

func (spellFetcher) SpellsByName(_ context.Context, _ string) ([]*chrondbc.Spell, error) {
	return nil, nil
}

func TestFeignDeathUsesAzerothCoreCombatantClass(t *testing.T) {
	t.Parallel()

	hunter := guid.GUID(1)
	killer := guid.GUID(2)
	at := time.Date(2026, time.September, 24, 12, 0, 0, 0, time.UTC)
	classes := make(map[guid.GUID]types.HeroClasses)
	spell := &chrondbc.Spell{ID: 28728}
	s := &Synthetic{classes: classes}
	s.feignDeath = wotlksynthetic.NewFeignDeath(context.Background(), spellFetcher{spell: spell}, func(g guid.GUID) types.HeroClasses {
		return classes[g]
	})

	_, err := s.ProcessMessages([]messages.Message{&messages.Combatant{
		MessageBase: messages.Base(at),
		Combatant: combatant.Combatant{
			Guid:      hunter,
			HeroClass: types.HeroClassesHUNTER,
		},
	}})
	require.NoError(t, err)

	_, err = s.ProcessMessages([]messages.Message{&messages.Damage{
		MessageBase: messages.Base(at.Add(time.Second)),
		Target:      hunter,
		Amount:      7764,
		Overkill:    0,
	}})
	require.NoError(t, err)

	result, err := s.ProcessMessages([]messages.Message{&messages.Slain{
		MessageBase: messages.Base(at.Add(2 * time.Second)),
		Victim:      hunter,
		Killer:      &killer,
	}})
	require.NoError(t, err)
	require.Len(t, result, 1)

	cast, ok := result[0].(*messages.SpellGo)
	require.True(t, ok)
	require.True(t, cast.IsSynthetic())
	require.Same(t, spell, cast.SpellData)
	require.Equal(t, hunter, cast.Caster)
}
