package gamedataapi

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClassBuffSpellFromSpell(t *testing.T) {
	t.Parallel()

	spell := func(targets ...chrondbc.ImplicitTarget) *chrondbc.Spell {
		rawTargets := make([]int32, len(targets))
		for i, target := range targets {
			rawTargets[i] = int32(target)
		}
		return &chrondbc.Spell{
			ID:               1243,
			Name_lang:        i18n.Text{i18n.English: "Power Word: Fortitude"},
			NameSubtext_lang: i18n.Text{i18n.English: "Rank 1"},
			SpellClassSet:    chrondbc.SpellClassSetPriest,
			Effects: []chrondbc.SpellEffect{{
				EffectIndex:    0,
				Effect:         chrondbc.EffectApplyAura,
				EffectAura:     chrondbc.AuraEffectModStat,
				ImplicitTarget: rawTargets,
			}},
		}
	}

	t.Run("friendly player aura", func(t *testing.T) {
		buff, ok := classBuffSpellFromSpell(spell(chrondbc.ImplicitTargetUnitTargetAlly))
		require.True(t, ok)
		assert.Equal(t, int32(1243), buff.ID)
		assert.Equal(t, "Power Word: Fortitude", buff.Name)
		assert.Equal(t, "Rank 1", buff.NameSubtext)
		assert.Equal(t, "friendly", buff.Targeting)
		require.Len(t, buff.Effects, 1)
		assert.Equal(t, int32(chrondbc.AuraEffectModStat), buff.Effects[0].AuraEffect)
		assert.Equal(t, chrondbc.AuraEffectModStat.String(), buff.Effects[0].AuraName)
	})

	t.Run("raid aura", func(t *testing.T) {
		buff, ok := classBuffSpellFromSpell(spell(chrondbc.ImplicitTargetUnitCasterAreaRaid))
		require.True(t, ok)
		assert.Equal(t, "group", buff.Targeting)
	})

	t.Run("area aura effect", func(t *testing.T) {
		areaAura := spell()
		areaAura.Effects[0].Effect = chrondbc.EffectApplyAreaAuraRaid
		buff, ok := classBuffSpellFromSpell(areaAura)
		require.True(t, ok)
		assert.Equal(t, "group", buff.Targeting)
	})

	t.Run("passive", func(t *testing.T) {
		passive := spell(chrondbc.ImplicitTargetUnitCaster)
		passive.Attrs.Set(chrondbc.Attr_Passive)
		_, ok := classBuffSpellFromSpell(passive)
		assert.False(t, ok)
	})

	t.Run("enemy aura", func(t *testing.T) {
		_, ok := classBuffSpellFromSpell(spell(chrondbc.ImplicitTargetUnitTargetEnemy))
		assert.False(t, ok)
	})

	t.Run("no target aura", func(t *testing.T) {
		_, ok := classBuffSpellFromSpell(spell(chrondbc.ImplicitTargetNone))
		assert.False(t, ok)
	})

	t.Run("self aura", func(t *testing.T) {
		_, ok := classBuffSpellFromSpell(spell(chrondbc.ImplicitTargetUnitCaster))
		assert.False(t, ok)
	})

	t.Run("dummy aura", func(t *testing.T) {
		dummy := spell(chrondbc.ImplicitTargetUnitTargetAlly)
		dummy.Effects[0].EffectAura = chrondbc.AuraEffectDummy
		_, ok := classBuffSpellFromSpell(dummy)
		assert.False(t, ok)
	})

	t.Run("generic spell", func(t *testing.T) {
		generic := spell(chrondbc.ImplicitTargetUnitCaster)
		generic.SpellClassSet = chrondbc.SpellClassSetGeneric
		_, ok := classBuffSpellFromSpell(generic)
		assert.False(t, ok)
	})

	t.Run("deprecated spell", func(t *testing.T) {
		deprecated := spell(chrondbc.ImplicitTargetUnitCaster)
		deprecated.Name_lang = i18n.Text{i18n.English: "[Deprecated] Fortitude"}
		_, ok := classBuffSpellFromSpell(deprecated)
		assert.False(t, ok)
	})

	t.Run("non aura", func(t *testing.T) {
		damage := spell(chrondbc.ImplicitTargetUnitTargetAlly)
		damage.Effects[0].Effect = chrondbc.EffectSchoolDMG
		_, ok := classBuffSpellFromSpell(damage)
		assert.False(t, ok)
	})
}

func TestDeriveClassBuffsStoresDatasetDocument(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Class Buffs",
		Slug:          "class-buffs",
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)

	spells := []*chrondbc.Spell{
		{
			ID:            1243,
			Name_lang:     i18n.Text{i18n.English: "Power Word: Fortitude"},
			SpellClassSet: chrondbc.SpellClassSetPriest,
			Effects: []chrondbc.SpellEffect{{
				EffectIndex:    0,
				Effect:         chrondbc.EffectApplyAura,
				EffectAura:     chrondbc.AuraEffectModStat,
				ImplicitTarget: []int32{int32(chrondbc.ImplicitTargetUnitTargetAlly)},
			}},
		},
		{
			ID:            589,
			Name_lang:     i18n.Text{i18n.English: "Shadow Word: Pain"},
			SpellClassSet: chrondbc.SpellClassSetPriest,
			Effects: []chrondbc.SpellEffect{{
				EffectIndex:    0,
				Effect:         chrondbc.EffectApplyAura,
				EffectAura:     chrondbc.AuraEffectPeriodicDamage,
				ImplicitTarget: []int32{int32(chrondbc.ImplicitTargetUnitTargetEnemy)},
			}},
		},
	}

	handler := &Handler{pool: pool}
	require.NoError(t, handler.deriveClassBuffs(ctx, dataset.ID, spells))

	raw, err := store.GetDatasetClassBuffs(ctx, dataset.ID)
	require.NoError(t, err)
	var byClass map[string][]classBuffSpell
	require.NoError(t, json.Unmarshal(raw, &byClass))
	require.Len(t, byClass[chrondbc.SpellClassSetPriest.String()], 1)
	assert.Equal(t, int32(1243), byClass[chrondbc.SpellClassSetPriest.String()][0].ID)
}
