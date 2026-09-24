package synthetic

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestLifebloomCreditsRecentPeriodicCaster(t *testing.T) {
	t.Parallel()

	druid := guid.GUID(1)
	target := guid.GUID(2)
	at := time.Date(2026, time.September, 24, 12, 0, 0, 0, time.UTC)
	attribution := newLifebloomAttribution()

	attribution.ProcessMessages([]messages.Message{&messages.Heal{
		MessageBase: messages.Base(at),
		SpellData:   &chrondbc.Spell{ID: lifebloomAuraSpellID},
		Caster:      druid,
		Target:      target,
		HitType:     types.HitTypePeriodic,
	}})
	bloom := &messages.Heal{
		MessageBase: messages.Base(at.Add(7 * time.Second)),
		SpellData:   &chrondbc.Spell{ID: lifebloomHealSpellID},
		Caster:      target,
		Target:      target,
	}
	attribution.ProcessMessages([]messages.Message{bloom})

	require.Equal(t, druid, bloom.Caster)
}

func TestLifebloomDoesNotUseStaleCaster(t *testing.T) {
	t.Parallel()

	druid := guid.GUID(1)
	target := guid.GUID(2)
	at := time.Date(2026, time.September, 24, 12, 0, 0, 0, time.UTC)
	attribution := newLifebloomAttribution()

	attribution.ProcessMessages([]messages.Message{&messages.SpellGo{
		MessageBase: messages.Base(at),
		SpellData:   &chrondbc.Spell{ID: lifebloomAuraSpellID},
		Caster:      druid,
		Target:      &target,
	}})
	bloom := &messages.Heal{
		MessageBase: messages.Base(at.Add(lifebloomMaxAge + time.Second)),
		SpellData:   &chrondbc.Spell{ID: lifebloomHealSpellID},
		Caster:      target,
		Target:      target,
	}
	attribution.ProcessMessages([]messages.Message{bloom})

	require.Equal(t, target, bloom.Caster)
}
