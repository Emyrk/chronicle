package types2proto

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

// arcaneSpell is a minimal DBC spell whose magic school is Arcane.
func arcaneSpell() *chrondbc.Spell {
	return &chrondbc.Spell{School: chrondbc.SchoolArcane}
}

func TestGearSlotPreservesGemPositions(t *testing.T) {
	t.Parallel()

	got := GearSlot(combatant.GearItem{
		ItemID:        51396,
		GemEnchantIDs: [4]int{0, 0, 3637, 0},
	})

	require.Equal(t, int32(51396), got.ItemId)
	require.Equal(t, []int32{0, 0, 3637, 0}, got.GemEnchantIds)
	require.Nil(t, GearSlot(combatant.GearItem{ItemID: 50633}).GemEnchantIds)
}

func TestCombatantInfoV22(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(1000)
	got := CombatantInfo(ts, 3, &messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant: combatant.Combatant{
			Guid: guid.GUID(1),
			V22: &combatant.CombatantInfoV22{
				PrimaryStat:            100,
				Stamina:                101,
				MeleeCritRating:        102,
				RangedCritRating:       103,
				SpellCritRating:        104,
				Speed:                  105,
				Leech:                  106,
				MeleeHasteRating:       107,
				RangedHasteRating:      108,
				SpellHasteRating:       109,
				Avoidance:              110,
				Mastery:                111,
				DamageDoneVersatility:  112,
				HealingDoneVersatility: 113,
				DamageTakenVersatility: 114,
				UnknownStat:            0,
				SpecID:                 116,
			},
		},
	})

	require.NotNil(t, got.V22)
	require.Equal(t, int32(100), got.V22.GetPrimaryStat())
	require.Equal(t, int32(101), got.V22.GetStamina())
	require.Equal(t, int32(102), got.V22.GetMeleeCritRating())
	require.Equal(t, int32(103), got.V22.GetRangedCritRating())
	require.Equal(t, int32(104), got.V22.GetSpellCritRating())
	require.Equal(t, int32(105), got.V22.GetSpeed())
	require.Equal(t, int32(106), got.V22.GetLeech())
	require.Equal(t, int32(107), got.V22.GetMeleeHasteRating())
	require.Equal(t, int32(108), got.V22.GetRangedHasteRating())
	require.Equal(t, int32(109), got.V22.GetSpellHasteRating())
	require.Equal(t, int32(110), got.V22.GetAvoidance())
	require.Equal(t, int32(111), got.V22.GetMastery())
	require.Equal(t, int32(112), got.V22.GetDamageDoneVersatility())
	require.Equal(t, int32(113), got.V22.GetHealingDoneVersatility())
	require.Equal(t, int32(114), got.V22.GetDamageTakenVersatility())
	require.NotNil(t, got.V22.UnknownStat)
	require.Zero(t, got.V22.GetUnknownStat())
	require.Equal(t, int32(116), got.V22.GetSpecId())
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

func TestUnitTelemetry(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(1000)
	unit := guid.GUID(1)
	position := UnitPosition(ts, 3, &messages.UnitPosition{
		MessageBase: messages.Base(ts),
		Unit:        unit,
		X:           1.25,
		Y:           -2.5,
		MapID:       1420,
		Facing:      3.14,
	})
	require.Equal(t, unit.String(), position.Unit)
	require.Equal(t, 1.25, position.X)
	require.Equal(t, -2.5, position.Y)
	require.Equal(t, int32(1420), position.MapId)
	require.Equal(t, 3.14, position.Facing)
	require.Equal(t, int32(3), position.Meta.Index)

	resources := UnitResources(ts, 4, &messages.UnitResources{
		MessageBase:   messages.Base(ts),
		Unit:          unit,
		CurrentHealth: 100,
		MaximumHealth: 120,
		Absorb:        5,
		PowerType:     types.ResourceMana,
		CurrentPower:  40,
		MaximumPower:  80,
		AttackPower:   10,
		SpellPower:    20,
		Armor:         30,
	})
	require.Equal(t, unit.String(), resources.Unit)
	require.Equal(t, int64(100), resources.CurrentHealth)
	require.Equal(t, int64(120), resources.MaximumHealth)
	require.Equal(t, int32(5), resources.Absorb)
	require.Equal(t, "Mana", resources.PowerType)
	require.Equal(t, int32(40), resources.CurrentPower)
	require.Equal(t, int32(80), resources.MaximumPower)
	require.Equal(t, int32(10), resources.AttackPower)
	require.Equal(t, int32(20), resources.SpellPower)
	require.Equal(t, int32(30), resources.Armor)
	require.Equal(t, int32(4), resources.Meta.Index)
}

func TestConsume(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(1706000000123)
	consumedAt := ts.Add(-time.Second).UnixMilli()
	amount := int32(45)
	resourceType := "Rage"
	itemID := int32(13442)
	itemName := "Mighty Rage Potion"
	got := Consume(ts, 7, &messages.Consume{
		MessageBase:      messages.Base(ts, messages.WithSynthetic()),
		ConsumeID:        "consume-a",
		EvidenceID:       "evidence-aura",
		Player:           guid.GUID(1),
		ItemID:           &itemID,
		ItemName:         &itemName,
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
	require.Equal(t, &itemName, got.ItemName)
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
		require.Equal(t, []chronicleproto.School{chronicleproto.School_Arcane}, got.Schools)
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
		require.Equal(t, []chronicleproto.School{chronicleproto.School_Fire}, got.Schools)
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
		require.Equal(t, []chronicleproto.School{chronicleproto.School_None}, got.Schools)
	})

	t.Run("MultipleSchoolsPreserved", func(t *testing.T) {
		t.Parallel()
		got := Damage(ts, 0, &messages.Damage{
			MessageBase: messages.Base(ts),
			Target:      guid.GUID(1),
			School:      types.FireSchool | types.FrostSchool,
		})
		require.Equal(t, chronicleproto.School_Fire, got.School)
		require.Equal(t, []chronicleproto.School{
			chronicleproto.School_Fire,
			chronicleproto.School_Frost,
		}, got.Schools)
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
	require.Equal(t, []chronicleproto.School{chronicleproto.School_Arcane}, got.Schools)
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
	require.Equal(t, []chronicleproto.School{chronicleproto.School_Arcane}, got.ExtraSchools)
}

func TestInterruptMultipleSchools(t *testing.T) {
	t.Parallel()
	ts := time.UnixMilli(1000)

	got := Interrupt(ts, 0, &messages.Interrupt{
		MessageBase: messages.Base(ts),
		Caster:      guid.GUID(1),
		Target:      guid.GUID(2),
		ExtraSchool: types.NatureSchool | types.ShadowSchool,
	})
	require.Equal(t, chronicleproto.School_Nature, got.ExtraSchool)
	require.Equal(t, []chronicleproto.School{
		chronicleproto.School_Nature,
		chronicleproto.School_Shadow,
	}, got.ExtraSchools)
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
	require.Equal(t, []chronicleproto.School{chronicleproto.School_Arcane}, got.AbsorbSchools)
}

func TestAbsorbedMultipleSchools(t *testing.T) {
	t.Parallel()
	ts := time.UnixMilli(1000)

	got := Absorbed(ts, 0, &messages.Absorbed{
		MessageBase:  messages.Base(ts),
		Attacker:     guid.GUID(1),
		Target:       guid.GUID(2),
		Caster:       guid.GUID(3),
		AbsorbSchool: types.HolySchool | types.FireSchool,
	})
	require.Equal(t, chronicleproto.School_Holy, got.AbsorbSchool)
	require.Equal(t, []chronicleproto.School{
		chronicleproto.School_Holy,
		chronicleproto.School_Fire,
	}, got.AbsorbSchools)
}

func TestAuraPreservesCaster(t *testing.T) {
	t.Parallel()

	ts := time.UnixMilli(5000)
	caster := guid.GUID(1)
	got := Aura(ts, 4, &messages.Aura{
		MessageBase: messages.Base(ts, messages.WithSynthetic()),
		Source:      &caster,
		Target:      guid.GUID(2),
		SpellData:   &chrondbc.Spell{ID: 17},
		SpellName:   "Power Word: Shield",
		Amount:      1,
		Transition:  messages.AuraTransitionRefreshed,
		State:       types.AuraStateAdded,
		IsBuff:      true,
	})

	require.Equal(t, caster.String(), got.GetCaster())
	require.Equal(t, chronicleproto.AuraTransition_TransitionRefreshed, got.Transition)
	require.True(t, got.IsBuff)
	require.True(t, got.Meta.IsSynthetic)
	require.Equal(t, int32(4), got.Meta.Index)
}

func TestAuraAllowsUnknownCaster(t *testing.T) {
	t.Parallel()

	got := Aura(time.UnixMilli(5000), 0, &messages.Aura{
		Target: guid.GUID(2),
	})

	require.Nil(t, got.Caster)
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
