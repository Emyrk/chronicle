package synthetic

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/require"
)

func TestDetectResurrections(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(1000)
	caster := guid.GUID(1)
	target := guid.GUID(2)

	t.Run("corpse owner", func(t *testing.T) {
		t.Parallel()

		spell := resurrectionSpell("Resurrection", chrondbc.EffectResurrect)
		result := DetectResurrections([]messages.Message{&messages.SpellGo{
			MessageBase: messages.Base(ts),
			SpellData:   spell,
			Caster:      caster,
			CorpseOwner: &target,
		}})

		require.Len(t, result, 2)
		resurrection, ok := result[1].(*messages.Resurrection)
		require.True(t, ok)
		require.Equal(t, caster, resurrection.Source)
		require.Equal(t, target, resurrection.Target)
		require.Same(t, spell, resurrection.Spell)
	})

	t.Run("self resurrection", func(t *testing.T) {
		t.Parallel()

		spell := resurrectionSpell("Reincarnation", chrondbc.EffectSelfResurrect)
		result := DetectResurrections([]messages.Message{&messages.SpellGo{
			MessageBase: messages.Base(ts),
			SpellData:   spell,
			Caster:      caster,
		}})

		require.Len(t, result, 2)
		resurrection, ok := result[1].(*messages.Resurrection)
		require.True(t, ok)
		require.Equal(t, caster, resurrection.Source)
		require.Equal(t, caster, resurrection.Target)
		require.Same(t, spell, resurrection.Spell)
	})

	t.Run("non resurrection", func(t *testing.T) {
		t.Parallel()

		result := DetectResurrections([]messages.Message{&messages.SpellGo{
			MessageBase: messages.Base(ts),
			SpellData:   resurrectionSpell("Heal", chrondbc.EffectHeal),
			Caster:      caster,
			Target:      &target,
		}})

		require.Len(t, result, 1)
	})
}

func resurrectionSpell(name string, effect chrondbc.Effect) *chrondbc.Spell {
	return &chrondbc.Spell{
		Name_lang: i18n.Text{i18n.English: name},
		Effect:    [3]chrondbc.Effect{effect},
	}
}
