package types2proto

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

// arcaneSpell is a minimal DBC spell whose magic school is Arcane.
func arcaneSpell() *chrondbc.Spell {
	return &chrondbc.Spell{School: chrondbc.SchoolArcane}
}

func TestResurrection(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(1000)
	spell := &chrondbc.Spell{ID: 2006}
	got := Resurrection(ts, 3, &messages.Resurrection{
		MessageBase: messages.Base(ts),
		Source:      guid.GUID(1),
		Target:      guid.GUID(2),
		Spell:       spell,
	})

	require.Equal(t, guid.GUID(1).String(), got.Source)
	require.Equal(t, guid.GUID(2).String(), got.Target)
	require.Equal(t, int32(2006), got.Spell.Id)
	require.Equal(t, int32(3), got.Meta.Index)
}

func TestConsume(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(1706000000123)
	consumedAt := ts.Add(-time.Second).UnixMilli()
	amount := int32(45)
	resourceType := "Rage"
	itemID := int32(13442)
	got := Consume(ts, 7, &messages.Consume{
		MessageBase:      messages.Base(ts, messages.WithSynthetic()),
		ConsumeID:        "consume-a",
		EvidenceID:       "evidence-aura",
		Player:           guid.GUID(1),
		ItemID:           &itemID,
		CandidateItemIDs: []int32{13442, 13443},
		SpellData:        &chrondbc.Spell{ID: 17528},
		Kind:             messages.EvidenceKindResource,
		Confidence:       messages.ConfidenceAmbiguous,
		ConsumedAtUnixMs: &consumedAt,
		ObservedAtUnixMs: ts.UnixMilli(),
		Amount:           &amount,
		ResourceType:     &resourceType,
		IsProjection:     true,
	})

	require.Equal(t, "consume-a", got.ConsumeId)
	require.Equal(t, "evidence-aura", got.EvidenceId)
	require.Equal(t, &resourceType, got.ResourceType)
	require.Equal(t, &consumedAt, got.ConsumedAtUnixMilli)
	require.Equal(t, []int32{13442, 13443}, got.CandidateItemIds)
	require.True(t, got.IsProjection)
	require.True(t, got.Meta.IsSynthetic)
	require.Equal(t, int32(7), got.Meta.Index)
}

func TestDamageSchoolBackfill(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(1000)

	t.Run("MissingSchoolBackfilledFromSpell", func(t *testing.T) {
		t.Parallel()
		got := Damage(ts, 0, &messages.Damage{
			MessageBase: messages.Base(ts),
			Target:      guid.GUID(1),
			School:      types.NoneSchool, // log omitted the school
			SpellData:   arcaneSpell(),
		})
		require.Equal(t, chronicleproto.School_Arcane, got.School)
	})

	t.Run("PresentSchoolKept", func(t *testing.T) {
		t.Parallel()
		got := Damage(ts, 0, &messages.Damage{
			MessageBase: messages.Base(ts),
			Target:      guid.GUID(1),
			School:      types.FireSchool, // must not be overwritten by Arcane spell
			SpellData:   arcaneSpell(),
		})
		require.Equal(t, chronicleproto.School_Fire, got.School)
	})

	t.Run("MissingSchoolNoSpellStaysNone", func(t *testing.T) {
		t.Parallel()
		got := Damage(ts, 0, &messages.Damage{
			MessageBase: messages.Base(ts),
			Target:      guid.GUID(1),
			School:      types.NoneSchool,
			SpellData:   nil, // e.g. melee / no spell data
		})
		require.Equal(t, chronicleproto.School_None, got.School)
	})
}

func TestHealSchoolBackfill(t *testing.T) {
	t.Parallel()
	ts := time.UnixMilli(1000)

	got := Heal(ts, 0, &messages.Heal{
		MessageBase: messages.Base(ts),
		Caster:      guid.GUID(1),
		Target:      guid.GUID(2),
		School:      types.NoneSchool,
		SpellData:   arcaneSpell(),
	})
	require.Equal(t, chronicleproto.School_Arcane, got.School)
}

func TestInterruptExtraSchoolBackfill(t *testing.T) {
	t.Parallel()
	ts := time.UnixMilli(1000)

	got := Interrupt(ts, 0, &messages.Interrupt{
		MessageBase:      messages.Base(ts),
		Caster:           guid.GUID(1),
		Target:           guid.GUID(2),
		ExtraSchool:      types.NoneSchool,
		InterruptedSpell: arcaneSpell(),
	})
	require.Equal(t, chronicleproto.School_Arcane, got.ExtraSchool)
}

func TestAbsorbedSchoolBackfill(t *testing.T) {
	t.Parallel()
	ts := time.UnixMilli(1000)

	got := Absorbed(ts, 0, &messages.Absorbed{
		MessageBase:  messages.Base(ts),
		Attacker:     guid.GUID(1),
		Target:       guid.GUID(2),
		Caster:       guid.GUID(3),
		AbsorbSchool: types.NoneSchool,
		AbsorbSpell:  arcaneSpell(),
	})
	require.Equal(t, chronicleproto.School_Arcane, got.AbsorbSchool)
}

func TestEventMetaSyntheticRoundTrip(t *testing.T) {
	t.Parallel()
	ts := time.UnixMilli(5000)

	t.Run("SyntheticTrue", func(t *testing.T) {
		t.Parallel()
		msg := &messages.Aura{
			MessageBase: messages.Base(ts, messages.WithSynthetic()),
			Target:      guid.GUID(1),
			SpellData:   &chrondbc.Spell{ID: 1},
			SpellName:   "Test",
			State:       types.AuraStateAdded,
		}
		meta := EventMeta(ts, 0, msg)
		require.True(t, meta.IsSynthetic, "synthetic message should produce IsSynthetic=true")
	})

	t.Run("NonSyntheticFalse", func(t *testing.T) {
		t.Parallel()
		msg := &messages.Aura{
			MessageBase: messages.Base(ts),
			Target:      guid.GUID(1),
			SpellData:   &chrondbc.Spell{ID: 1},
			SpellName:   "Test",
			State:       types.AuraStateAdded,
		}
		meta := EventMeta(ts, 0, msg)
		require.False(t, meta.IsSynthetic, "non-synthetic message should produce IsSynthetic=false")
	})
}
