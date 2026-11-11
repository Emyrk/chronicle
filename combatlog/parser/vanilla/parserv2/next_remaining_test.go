package parserv2

import (
	"bufio"
	"compress/gzip"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func assertRecordParity(t *testing.T, db gamedb.GameDB, line string) bool {
	t.Helper()
	p := &Parser{ctx: t.Context(), wowDB: db, missedSpells: make(map[chrondbc.SpellID]missedSpellEntry)}
	ts, event, m, err := ParseLine(line)
	require.NoError(t, err)
	// Bind only implemented records; unsupported corpus records are counted separately.
	handlers := map[string]func(time.Time, *Matched) ([]messages.Message, error){
		"LOOT": func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.loot(t.Context(), ts, m) },
		"RG":   func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.raidGroup(t.Context(), ts, m) },
		"RAID_COMPOSITION": func(ts time.Time, m *Matched) ([]messages.Message, error) {
			return p.raidComposition(t.Context(), ts, m)
		},
		"UNIT_STATE":  func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.unitState(t.Context(), ts, m) },
		"UNIT_INFO":   func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.unitInfo(t.Context(), ts, m) },
		"ZONE_INFO":   func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.zoneInfo(t.Context(), ts, m) },
		"LOOT_TRADE":  func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.lootTrade(t.Context(), ts, m) },
		"SPELL_START": func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.spellStart(t.Context(), ts, m) },
		"SPELL_GO":    func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.spellGo(t.Context(), ts, m) },
		"AURA_CAST":   func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.auraCast(t.Context(), ts, m) },
		"ENERGIZE":    func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.energize(t.Context(), ts, m) },
		"DISPEL":      func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.dispel(t.Context(), ts, m) },
		"BUFF_ADD": func(ts time.Time, m *Matched) ([]messages.Message, error) {
			return p.aura(t.Context(), "BUFF_ADD", ts, true, m)
		},
		"BUFF_REM": func(ts time.Time, m *Matched) ([]messages.Message, error) {
			return p.aura(t.Context(), "BUFF_REM", ts, true, m)
		},
		"DEBUFF_ADD": func(ts time.Time, m *Matched) ([]messages.Message, error) {
			return p.aura(t.Context(), "DEBUFF_ADD", ts, false, m)
		},
		"DEBUFF_REM": func(ts time.Time, m *Matched) ([]messages.Message, error) {
			return p.aura(t.Context(), "DEBUFF_REM", ts, false, m)
		},
		"SWING":      func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.swing(t.Context(), ts, m) },
		"DEATH":      func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.slain(t.Context(), ts, m) },
		"HEAL":       func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.heal(t.Context(), ts, m) },
		"SPELL_DMG":  func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.spell_dmg(t.Context(), ts, m) },
		"MISS":       func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.spellMiss(t.Context(), ts, m) },
		"ENV_DMG":    func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.envDmg(t.Context(), ts, m) },
		"DMG_SHIELD": func(ts time.Time, m *Matched) ([]messages.Message, error) { return p.dmgShield(t.Context(), ts, m) },
	}
	handler, ok := handlers[event]
	if !ok {
		return false
	}
	want, wantErr := handler(ts, m)
	got, gotErr := next.DecodeRecord(t.Context(), db, line)
	if wantErr != nil {
		require.EqualError(t, gotErr, wantErr.Error(), line)
		require.Nil(t, got)
		return true
	}
	require.NoError(t, gotErr, line)
	require.Equal(t, want, got, line)
	return true
}

func TestNextRemainingParity(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("../../../parsernext/vanilla/testdata/capybara-remaining.log")
	require.NoError(t, err)
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	for i := -1; i <= 12; i++ {
		lines = append(lines, fmt.Sprintf("1|MISS|0x0000000000000001|0x0000000000000002|123|%d", i))
	}
	for i := -1; i <= 7; i++ {
		lines = append(lines, fmt.Sprintf("1|ENV_DMG|0x0000000000000001|%d|100|2|3", i))
		lines = append(lines, fmt.Sprintf("1|DMG_SHIELD|0x0000000000000001|0x0000000000000002|100|%d", i))
	}
	for _, line := range append([]string(nil), lines...) {
		f := strings.Split(line, "|")
		for i := 2; i < len(f); i++ {
			lines = append(lines, strings.Join(f[:i], "|"))
			bad := append([]string(nil), f...)
			bad[i] = "bad"
			lines = append(lines, strings.Join(bad, "|"))
		}
	}
	periodic := &chrondbc.Spell{ID: 123, Effects: []chrondbc.SpellEffect{{Effect: chrondbc.EffectApplyAura, EffectAura: chrondbc.AuraEffectPeriodicDamage}}}
	for _, db := range []gamedb.GameDB{combatSpellLookup{}, &stubGameDB{spells: map[chrondbc.SpellID]*chrondbc.Spell{123: periodic}}, combatSpellLookup{err: errors.New("lookup failed")}} {
		for _, line := range lines {
			require.True(t, assertRecordParity(t, db, line))
		}
	}
}

// Optional local corpus replay avoids checking thousands of public records into
// the repo. It compares decoded messages, not the complete synthetic pipeline.
func TestNextSavedCorpusParity(t *testing.T) {
	t.Parallel()
	path := os.Getenv("CHRONICLE_PARSER_PARITY_GZIP")
	if path == "" {
		t.Skip("set CHRONICLE_PARSER_PARITY_GZIP to a preserved public gzip")
	}
	file, err := os.Open(path)
	require.NoError(t, err)
	defer func() { require.NoError(t, file.Close()) }()
	reader, err := gzip.NewReader(file)
	require.NoError(t, err)
	defer func() { require.NoError(t, reader.Close()) }()
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 4096), 4<<20)
	supported, unsupported := 0, 0
	for scanner.Scan() {
		if assertRecordParity(t, &stubGameDB{}, scanner.Text()) {
			supported++
		} else {
			unsupported++
		}
	}
	require.NoError(t, scanner.Err())
	require.Positive(t, supported)
	t.Logf("supported=%d unsupported=%d (missing-spell fallback lookup)", supported, unsupported)
}
