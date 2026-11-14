package parserv2

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestNextSpellParity(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("../../../parsernext/vanilla/testdata/capybara-spells.log")
	require.NoError(t, err)
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	heal := "1|HEAL|0x0000000000000001|0x0000000000000002|10876|100|1|1"
	damage := "1|SPELL_DMG|0x0000000000000001|0x0000000000000002|10876|100|1,2,3|2|5|62,0,0,0"
	lines = append(lines, heal, damage)
	// Every missing-field boundary and malformed numeric/GUID field must retain
	// the original error precedence, including spell lookup before later fields.
	for _, line := range []string{heal, damage} {
		fields := strings.Split(line, "|")
		for i := 2; i < len(fields); i++ {
			lines = append(lines, strings.Join(fields[:i], "|"))
			copyFields := append([]string(nil), fields...)
			copyFields[i] = "bad"
			lines = append(lines, strings.Join(copyFields, "|"))
		}
		for _, id := range []string{"0", "-1", "2147483648", ""} {
			f := append([]string(nil), fields...)
			f[4] = id
			lines = append(lines, strings.Join(f, "|"))
		}
	}
	for _, mitigation := range []string{"0,0", "0,0,0,0", "2147483648,0,0", "-1,-2,-3"} {
		lines = append(lines, strings.Replace(damage, "1,2,3", mitigation, 1))
	}
	for _, effects := range []string{"62,0,0", "62,0,0,0,0", "0,0,0,162", "0,0,0,3"} {
		lines = append(lines, strings.Replace(damage, "62,0,0,0", effects, 1))
	}
	for _, db := range []gamedb.GameDB{
		&stubGameDB{spells: map[chrondbc.SpellID]*chrondbc.Spell{10876: manaBurnSpell()}},
		combatSpellLookup{err: errors.New("lookup unavailable")},
	} {
		for _, line := range lines {
			p := &Parser{ctx: t.Context(), wowDB: db, missedSpells: make(map[chrondbc.SpellID]missedSpellEntry)}
			ts, event, m, err := ParseLine(line)
			require.NoError(t, err)
			handler := p.heal
			if event == "SPELL_DMG" {
				handler = p.spell_dmg
			}
			want, wantErr := handler(t.Context(), ts, m)
			got, gotErr := next.DecodeRecord(t.Context(), db, line)
			if wantErr != nil {
				require.EqualError(t, gotErr, wantErr.Error(), line)
				require.Nil(t, got)
				continue
			}
			require.NoError(t, gotErr, line)
			require.Equal(t, want, got, line)
		}
	}
}

func TestNextSpellPowerBurn(t *testing.T) {
	t.Parallel()
	spell := manaBurnSpell()
	// Default difficulty selection must not accidentally choose the first row.
	spell.Effects = append([]chrondbc.SpellEffect{{DifficultyID: 198, Effect: chrondbc.EffectPowerBurn, EffectAmplitude: 99, EffectMiscValue: []int32{3}}}, spell.Effects...)
	db := &stubGameDB{spells: map[chrondbc.SpellID]*chrondbc.Spell{10876: spell}}
	got, err := next.DecodeRecord(t.Context(), db, "1|SPELL_DMG|0x0000000000000001|0x0000000000000002|10876|100|1,2,3|2|5|62,0,0,0")
	require.NoError(t, err)
	require.Len(t, got, 2)
	damage := got[0].(*messages.Damage)
	require.Equal(t, types.HitTypeCrit, damage.HitType)
	require.EqualValues(t, 1, *damage.Trailer[0].Amount)
	require.EqualValues(t, 2, *damage.Trailer[1].Amount)
	require.EqualValues(t, 3, *damage.Trailer[2].Amount)
	drain := got[1].(*messages.ResourceChange)
	require.Equal(t, types.ResourceMana, drain.Resource)
	require.EqualValues(t, 141, drain.Amount) // round(106 / (0.5 * 1.5))
	require.Equal(t, types.ChangeDirectionLoss, drain.Direction)
	require.Len(t, spell.Effects, 4)
}

func TestNextSpellPeriodicAndHeal(t *testing.T) {
	t.Parallel()
	for _, hybrid := range []bool{false, true} {
		spell := &chrondbc.Spell{ID: 123, School: chrondbc.SchoolNature, Effects: []chrondbc.SpellEffect{{EffectIndex: 0, Effect: chrondbc.EffectApplyAura, EffectAura: chrondbc.AuraEffectPeriodicDamage}}}
		if hybrid {
			spell.Effects = append(spell.Effects, chrondbc.SpellEffect{EffectIndex: 1, Effect: chrondbc.EffectSchoolDMG})
		}
		db := &stubGameDB{spells: map[chrondbc.SpellID]*chrondbc.Spell{123: spell}}
		for _, aura := range []string{"0", "3", "8", "24", "64", "89"} {
			line := "1|SPELL_DMG|0x0000000000000001|0x0000000000000002|123|42|0,0,0|0|3|6,2,0," + aura
			p := &Parser{ctx: t.Context(), wowDB: db, missedSpells: make(map[chrondbc.SpellID]missedSpellEntry)}
			ts, _, m, err := ParseLine(line)
			require.NoError(t, err)
			want, err := p.spell_dmg(t.Context(), ts, m)
			require.NoError(t, err)
			got, err := next.DecodeRecord(t.Context(), db, line)
			require.NoError(t, err)
			require.Equal(t, want, got)
			require.Equal(t, !hybrid || aura != "0", got[0].(*messages.Damage).HitType.Has(types.HitTypePeriodic))
		}
		got, err := next.DecodeRecord(t.Context(), db, "1|HEAL|0x0000000000000001|0x0000000000000002|123|42|1|1")
		require.NoError(t, err)
		heal := got[0].(*messages.Heal)
		require.Equal(t, types.HitTypeCrit|types.HitTypePeriodic, heal.HitType)
		require.Equal(t, types.NatureSchool, heal.School)
		require.EqualValues(t, 1, heal.Target)
		require.EqualValues(t, 2, heal.Caster)
	}
}

func TestNextSpellLookupTracking(t *testing.T) {
	t.Parallel()
	p := &Parser{ctx: t.Context(), wowDB: &stubGameDB{}, missedSpells: make(map[chrondbc.SpellID]missedSpellEntry)}
	_, err := next.DecodeRecord(t.Context(), p, "1|HEAL|0x0000000000000001|0x0000000000000002|999|bad|0|0")
	require.Error(t, err)
	require.Equal(t, 1, p.MissedSpells()[999].Count, "lookup precedes the later malformed amount, just as in legacy")
}
