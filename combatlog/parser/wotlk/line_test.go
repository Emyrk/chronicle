package wotlk

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseLine_SwingDamage(t *testing.T) {
	t.Parallel()
	line := `1/14 20:40:08.214  SWING_DAMAGE,0x000000000005B319,"Anasui",0x10512,0xF1300023890000AD,"Scarshield Legionnaire",0xa48,244,0,1,0,0,0,nil,nil,nil`

	ts, event, m, err := ParseLine(line)
	require.NoError(t, err)
	assert.Equal(t, "SWING_DAMAGE", event)
	// Year 0 because ParseLine doesn't know the year.
	assert.Equal(t, time.Month(1), ts.Month())
	assert.Equal(t, 14, ts.Day())
	assert.Equal(t, 20, ts.Hour())
	assert.Equal(t, 40, ts.Minute())
	assert.Equal(t, 8, ts.Second())

	// Parse base params: sourceGUID, sourceName, sourceFlags, destGUID, destName, destFlags
	assert.Equal(t, guid.GUID(0x000000000005B319), m.Guid())
	assert.Equal(t, "Anasui", m.String())
	assert.Equal(t, uint32(0x10512), m.HexUint32())
	assert.Equal(t, guid.GUID(0xF1300023890000AD), m.Guid())
	assert.Equal(t, "Scarshield Legionnaire", m.String())
	assert.Equal(t, uint32(0xa48), m.HexUint32())

	// Suffix fields: amount, overkill, school, resisted, blocked, absorbed, critical, glancing, crushing
	assert.Equal(t, int32(244), m.Int32())
	assert.Equal(t, int32(0), m.Int32())   // overkill
	assert.Equal(t, int32(1), m.Int32())   // school (Physical)
	assert.Equal(t, int32(0), m.Int32())   // resisted
	assert.Equal(t, int32(0), m.Int32())   // blocked
	assert.Equal(t, int32(0), m.Int32())   // absorbed
	assert.Nil(t, m.NilBool())             // critical = nil
	assert.Nil(t, m.NilBool())             // glancing = nil
	assert.Nil(t, m.NilBool())             // crushing = nil
	require.NoError(t, m.Error())
	assert.Equal(t, 0, m.Remain())
}

func TestParseLine_SpellAuraAppliedDose(t *testing.T) {
	t.Parallel()
	line := `1/14 20:40:08.481  SPELL_AURA_APPLIED_DOSE,0x00000000000019CA,"Ioser",0x512,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,85080,"Talon Rip",0x1,DEBUFF,2`

	ts, event, m, err := ParseLine(line)
	require.NoError(t, err)
	assert.Equal(t, "SPELL_AURA_APPLIED_DOSE", event)
	assert.Equal(t, 14, ts.Day())

	// Base params
	assert.Equal(t, guid.GUID(0x00000000000019CA), m.Guid())
	assert.Equal(t, "Ioser", m.String())
	_ = m.HexUint32() // sourceFlags
	assert.Equal(t, guid.GUID(0xF1300023890000A9), m.Guid())
	assert.Equal(t, "Scarshield Legionnaire", m.String())
	_ = m.HexUint32() // destFlags

	// Spell prefix: spellId, spellName, spellSchool
	assert.Equal(t, int32(85080), m.Int32())
	assert.Equal(t, "Talon Rip", m.String())
	assert.Equal(t, types.PhysicalSchool, m.School()) // 0x1 = Physical

	// Suffix: auraType, amount
	assert.Equal(t, "DEBUFF", m.String())
	assert.Equal(t, int32(2), m.Int32())
	require.NoError(t, m.Error())
}

func TestParseLine_SpellCastSuccess(t *testing.T) {
	t.Parallel()
	line := `1/14 20:40:09.143  SPELL_CAST_SUCCESS,0x00000000000019CA,"Ioser",0x512,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,6774,"Slice and Dice",0x1`

	ts, event, m, err := ParseLine(line)
	require.NoError(t, err)
	assert.Equal(t, "SPELL_CAST_SUCCESS", event)
	assert.Equal(t, 9, ts.Second())

	// Consume all fields without error
	_ = m.Guid()      // sourceGUID
	_ = m.String()     // sourceName
	_ = m.HexUint32()  // sourceFlags
	_ = m.Guid()       // destGUID
	_ = m.String()     // destName
	_ = m.HexUint32()  // destFlags
	spellID := m.Int32()
	spellName := m.String()
	school := m.School()

	assert.Equal(t, int32(6774), spellID)
	assert.Equal(t, "Slice and Dice", spellName)
	assert.Equal(t, types.PhysicalSchool, school)
	require.NoError(t, m.Error())
}

func TestParseLine_SwingMissed(t *testing.T) {
	t.Parallel()
	line := `1/14 20:40:08.853  SWING_MISSED,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,0x000000000005B319,"Anasui",0x10512,MISS`

	_, event, m, err := ParseLine(line)
	require.NoError(t, err)
	assert.Equal(t, "SWING_MISSED", event)

	_ = m.Guid()      // sourceGUID
	_ = m.String()     // sourceName
	_ = m.HexUint32()  // sourceFlags
	_ = m.Guid()       // destGUID
	_ = m.String()     // destName
	_ = m.HexUint32()  // destFlags
	missType := m.String()
	assert.Equal(t, "MISS", missType)
	require.NoError(t, m.Error())
}

func TestParseLine_NilDestGUID(t *testing.T) {
	t.Parallel()
	line := `1/14 20:40:09.143  SPELL_CAST_SUCCESS,0x000000000004700C,"Ihleniel",0x512,0x0000000000000000,nil,0x80000000,84529,"Seal of Dedication",0x2`

	_, event, m, err := ParseLine(line)
	require.NoError(t, err)
	assert.Equal(t, "SPELL_CAST_SUCCESS", event)

	_ = m.Guid()      // sourceGUID
	_ = m.String()     // sourceName
	_ = m.HexUint32()  // sourceFlags

	// dest GUID is 0x0000000000000000 — should parse fine as a zero GUID
	destGUID := m.Guid()
	assert.True(t, destGUID.IsZero())

	destName := m.NilString()
	assert.Nil(t, destName)

	require.NoError(t, m.Error())
}

func TestParseLine_EmptyLine(t *testing.T) {
	t.Parallel()
	_, _, _, err := ParseLine("")
	require.Error(t, err)
}

func TestParseLine_NoSeparator(t *testing.T) {
	t.Parallel()
	_, _, _, err := ParseLine("garbage no separator")
	require.Error(t, err)
}

func TestMatched_OutOfBounds(t *testing.T) {
	t.Parallel()
	m := &Matched{parts: []string{"hello"}, index: 0}
	_ = m.String() // consumes the one field
	_ = m.String() // out of bounds
	require.Error(t, m.Error())
}
func TestSplitCSVFields(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		input  string
		expect []string
	}{
		{
			name:   "simple",
			input:  `SWING_DAMAGE,0x01,"Agar",0x0`,
			expect: []string{`SWING_DAMAGE`, `0x01`, `"Agar"`, `0x0`},
		},
		{
			name:   "comma inside quotes",
			input:  `SPELL_AURA_REMOVED,0x01,"Agar",0x0,0x01,"Agar",0x0,5302,"Defensive State - Follows a successful block, dodge or parry.",0x0,BUFF`,
			expect: []string{`SPELL_AURA_REMOVED`, `0x01`, `"Agar"`, `0x0`, `0x01`, `"Agar"`, `0x0`, `5302`, `"Defensive State - Follows a successful block, dodge or parry."`, `0x0`, `BUFF`},
		},
		{
			name:   "no quotes",
			input:  `A,B,C`,
			expect: []string{`A`, `B`, `C`},
		},
		{
			name:   "empty field",
			input:  `A,,C`,
			expect: []string{`A`, ``, `C`},
		},
		{
			name:   "single field",
			input:  `EVENT`,
			expect: []string{`EVENT`},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := splitCSVFields(tc.input)
			assert.Equal(t, tc.expect, got)
		})
	}
}

func TestParseLineUnixMillis_QuotedComma(t *testing.T) {
	t.Parallel()
	line := `1776935650722  SPELL_AURA_REMOVED,0x0000000000000001,"Agar",0x0,0x0000000000000001,"Agar",0x0,5302,"Defensive State - Follows a successful block, dodge or parry.",0x0,BUFF`

	_, event, m, err := ParseLineUnixMillis(line)
	require.NoError(t, err)
	assert.Equal(t, "SPELL_AURA_REMOVED", event)

	// source
	assert.Equal(t, guid.GUID(0x0000000000000001), m.Guid())
	assert.Equal(t, "Agar", m.String())
	_ = m.HexUint32() // sourceFlags

	// dest
	assert.Equal(t, guid.GUID(0x0000000000000001), m.Guid())
	assert.Equal(t, "Agar", m.String())
	_ = m.HexUint32() // destFlags

	// spell prefix
	assert.Equal(t, int32(5302), m.Int32())
	assert.Equal(t, "Defensive State - Follows a successful block, dodge or parry.", m.String())
	_ = m.School() // spellSchool

	// aura type
	assert.Equal(t, "BUFF", m.String())
	require.NoError(t, m.Error())
	assert.Equal(t, 0, m.Remain())
}

func TestExtractUnixMilli(t *testing.T) {
	t.Parallel()

	ts, payload, err := ExtractUnixMilli("1714300000000  SPELL_DAMAGE,0x1,\"A\",0x0")
	require.NoError(t, err)
	assert.Equal(t, int64(1714300000000), ts.UnixMilli())
	assert.Equal(t, "SPELL_DAMAGE,0x1,\"A\",0x0", payload)
}

func TestExtractUnixMilli_EmptyLine(t *testing.T) {
	t.Parallel()

	_, _, err := ExtractUnixMilli("")
	require.Error(t, err)
}

func TestExtractUnixMilli_NoSeparator(t *testing.T) {
	t.Parallel()

	_, _, err := ExtractUnixMilli("1714300000000SPELL_DAMAGE")
	require.Error(t, err)
}

