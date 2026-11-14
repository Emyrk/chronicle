package cleu_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecoderRequiresExplicitFormatAndFlavor(t *testing.T) {
	t.Parallel()
	_, err := cleu.NewDecoder(cleu.Context{}, cleu.Hooks{})
	require.ErrorContains(t, err, "format is required")
	_, err = cleu.NewDecoder(cleu.Context{Format: database.LogFormat335aCcAddon}, cleu.Hooks{})
	require.ErrorContains(t, err, "flavor is required")
}

func TestDecoderDamageSuffixByExplicitFormat(t *testing.T) {
	t.Parallel()
	const (
		source = "0x000000000008DCCC"
		target = "0xF130003D41000001"
	)
	base := []string{source, "Rhyd", "0x10511", target, "Prince Malchezaar", "0x10a48"}

	t.Run("tbc", func(t *testing.T) {
		decoder, err := cleu.NewDecoder(cleu.Context{
			Format: database.LogFormat243CcAddon,
			Flavor: database.WoWFlavor{database.FlavorTBC},
		}, cleu.Hooks{})
		require.NoError(t, err)
		decoded, err := decoder.Decode(time.Unix(1, 0), "SWING_DAMAGE", cleu.NewFields(append(base, "250", "1", "5", "0", "10", "1", "nil", "nil")), "")
		require.NoError(t, err)
		require.Len(t, decoded, 1)
		damage := decoded[0].(*messages.Damage)
		assert.Equal(t, int32(250), damage.Amount)
		assert.Zero(t, damage.Overkill)
		assert.Equal(t, types.PhysicalSchool, damage.School)
		assert.True(t, damage.HitType.Has(types.HitTypeCrit))
		assert.True(t, damage.HitType.Has(types.HitTypePartialResist))
		assert.True(t, damage.HitType.Has(types.HitTypePartialAbsorb))
	})

	t.Run("wrath", func(t *testing.T) {
		decoder, err := cleu.NewDecoder(cleu.Context{
			Format: database.LogFormat335aCcAddon,
			Flavor: database.WoWFlavor{database.FlavorWrath},
		}, cleu.Hooks{})
		require.NoError(t, err)
		decoded, err := decoder.Decode(time.Unix(1, 0), "SWING_DAMAGE", cleu.NewFields(append(base, "250", "12", "1", "5", "0", "10", "true", "nil", "nil", "false")), "")
		require.NoError(t, err)
		require.Len(t, decoded, 1)
		damage := decoded[0].(*messages.Damage)
		assert.Equal(t, int32(12), damage.Overkill)
		assert.True(t, damage.HitType.Has(types.HitTypeMainHand))
	})
}

func TestDecodeRecordConsumesNormalizedPayload(t *testing.T) {
	t.Parallel()
	const payload = `SPELL_DAMAGE,0x00000000000019CA,"Mage",0x512,0xF1300023890000A9,"Target",0xa48,44614,"Frostfire Bolt",0x14,1000,0,20,0,0,0,nil,nil,nil`
	event, fields, err := cleu.ParsePayload(payload)
	require.NoError(t, err)

	decoder, err := cleu.NewDecoder(cleu.Context{
		Format: database.LogFormat335aCcAddon,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	}, cleu.Hooks{})
	require.NoError(t, err)
	timestamp := time.Unix(3, 0)
	decoded, err := decoder.DecodeRecord(cleu.Record{
		Timestamp: timestamp,
		Event:     event,
		Fields:    fields,
		Raw:       payload,
	})
	require.NoError(t, err)
	require.Len(t, decoded, 1)
	damage := decoded[0].(*messages.Damage)
	assert.Equal(t, timestamp, damage.Date())
	assert.Equal(t, int32(1000), damage.Amount)
	assert.Equal(t, types.FireSchool|types.FrostSchool, damage.School)
	assert.Equal(t, "Frostfire Bolt", *damage.SpellName)
}

func TestDecoderPreservesCallerOwnedHooks(t *testing.T) {
	t.Parallel()
	timestamp := time.Unix(2, 0)
	eventHookCalled := false
	companionHookCalled := false
	decoder, err := cleu.NewDecoder(cleu.Context{
		Format: database.LogFormat335aCcAddon,
		Flavor: database.WoWFlavor{database.FlavorWrath},
	}, cleu.Hooks{
		DecodeEvent: func(ts time.Time, event string, _ cleu.Cursor, raw string) ([]messages.Message, bool, error) {
			if event != "CUSTOM_EVENT" {
				return nil, false, nil
			}
			eventHookCalled = true
			assert.Equal(t, timestamp, ts)
			assert.Equal(t, "raw", raw)
			return messages.Unparsed(ts, "hook"), true, nil
		},
		DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
			companionHookCalled = true
			assert.Equal(t, "companion", payload)
			return messages.Unparsed(ts, payload), true, nil
		},
	})
	require.NoError(t, err)
	decoded, err := decoder.Decode(timestamp, "CUSTOM_EVENT", cleu.NewFields(nil), "raw")
	require.NoError(t, err)
	require.Len(t, decoded, 1)
	assert.True(t, eventHookCalled)

	fields := []string{"0x0000000000000001", "Caster", "0", "0x0000000000000002", "Target", "0", "1", "Spell", "1", "companion"}
	decoded, err = decoder.DecodeRecord(cleu.Record{
		Timestamp: timestamp,
		Event:     "SPELL_CAST_FAILED",
		Fields:    fields,
	})
	require.NoError(t, err)
	require.Len(t, decoded, 1)
	assert.True(t, companionHookCalled)
}
