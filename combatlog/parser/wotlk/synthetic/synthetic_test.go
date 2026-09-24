package synthetic

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestNewWithOptionsConfiguresOptionalAttribution(t *testing.T) {
	t.Parallel()

	s := NewWithOptions(context.Background(), slog.Default(), nil, nil, nil, Options{
		CreditEarthShield: true,
		GenerateAbsorbs:   false,
		DetectZone:        false,
	})
	require.NotNil(t, s.earthShield)
	require.Nil(t, s.absorption)
	require.Nil(t, s.zoneDetector)
	require.Nil(t, s.feignDeath)

	wotlkCtx := parsectx.With(context.Background(), parsectx.Context{Format: database.LogFormat335aCcAddon})
	wotlk := New(wotlkCtx, slog.Default(), nil, nil, nil, false)
	require.Nil(t, wotlk.earthShield)
	require.NotNil(t, wotlk.absorption)
	require.NotNil(t, wotlk.feignDeath)

	for _, format := range []database.LogFormat{
		database.LogFormat243CcAddon,
		database.LogFormatAzerothcoreMod,
		database.LogFormatV9Cleu,
	} {
		ctx := parsectx.With(context.Background(), parsectx.Context{Format: format})
		s := New(ctx, slog.Default(), nil, nil, nil, false)
		require.Nil(t, s.feignDeath, "format %s", format)
	}
}

func TestEarthShieldCreditsOriginalCaster(t *testing.T) {
	t.Parallel()

	shaman := guid.GUID(1)
	target := guid.GUID(2)
	at := time.Date(2026, time.September, 8, 12, 0, 0, 0, time.UTC)
	auraSpell := &chrondbc.Spell{ID: 32594}
	healSpell := &chrondbc.Spell{ID: earthShieldHealSpellID}

	attribution := newEarthShieldAttribution()
	attribution.ProcessMessages([]messages.Message{&messages.SpellGo{
		MessageBase: messages.Base(at),
		SpellData:   auraSpell,
		Caster:      shaman,
		Target:      &target,
	}})
	heal := &messages.Heal{
		MessageBase: messages.Base(at.Add(time.Second)),
		SpellData:   healSpell,
		Caster:      target,
		Target:      target,
		Amount:      100,
	}
	attribution.ProcessMessages([]messages.Message{heal})

	require.Equal(t, shaman, heal.Caster)
}
