package parserv2

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parsernext"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

type combatSpellLookup struct {
	gamedb.GameDB
	err error
}

func (s combatSpellLookup) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if s.err != nil {
		return nil, s.err
	}
	spell := chrondbc.UnknownSpell(id)
	return &spell, nil
}

// This test also runs with an overlay restoring the pre-extraction matcher and
// conversions, so parity is checked against the original implementation.
func TestNextCombatParity(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("../../../parsernext/vanilla/testdata/capybara-melee.log")
	require.NoError(t, err)
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	lines = append(lines,
		"1|DEATH", "1|DEATH|bad", "1|DEATH|0x0000000000000000",
		"1|SWING", "1|SWING|bad|bad|x|x|x|x|x|x|x",
		"1|SWING|0x0000000000000001|0x0000000000000002|2147483648|128|1|2147483648|0|0|0",
	)
	for _, lookupErr := range []error{nil, chrondbc.SpellNotFound(chrondbc.SpellIDAutoAttack), errors.New("lookup unavailable")} {
		db := combatSpellLookup{err: lookupErr}
		p := &Parser{ctx: t.Context(), wowDB: db}
		for _, line := range lines {
			ts, event, m, err := ParseLine(line)
			require.NoError(t, err)
			handler := p.swing
			if event == "DEATH" {
				handler = p.slain
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
func TestNextUnsupportedCombat(t *testing.T) {
	t.Parallel()
	for _, line := range []string{"1|HEADER", "1|COMBATANT_INFO"} {
		got, err := next.DecodeRecord(t.Context(), nil, line)
		require.ErrorIs(t, err, next.ErrUnsupportedRecord)
		require.Nil(t, got)
	}
	for _, line := range []string{"bad", "bad|DEATH|bad", "1|SWING"} {
		got, err := next.DecodeRecord(t.Context(), nil, line)
		require.Error(t, err)
		require.Nil(t, got)
	}
}

// A known critter's eligibility never suppresses the decoded damage/death.
func TestNextCritterCombatFile(t *testing.T) {
	t.Parallel()
	const rat = "0xF130000FEB000001"
	id, err := guid.FromString(rat)
	require.NoError(t, err)
	classification, handled := next.ClassifyCritter(id)
	require.True(t, handled)
	require.True(t, classification.Known)
	require.False(t, classification.TrackFight)
	require.False(t, classification.RankedDamageTarget)
	input := "1234|SWING|0x0000000000000001|" + rat + "|45|128|1|1|2|3|4\r\n1235|DEATH|" + rat
	var decoded []messages.Message
	summary, err := parsernext.ReadFile(t.Context(), parsernext.Selection{Format: formats.VanillaCompanion, Expansion: next.Name}, strings.NewReader(input), 1024, func(line common.Line) error {
		batch, err := next.DecodeRecord(t.Context(), combatSpellLookup{}, strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r"))
		if err != nil {
			return err
		}
		decoded = append(decoded, batch...)
		return nil
	})
	require.NoError(t, err)
	require.EqualValues(t, 2, summary.Lines)
	require.Len(t, decoded, 2)
	damage := decoded[0].(*messages.Damage)
	require.Equal(t, id, damage.Target)
	require.EqualValues(t, 45, damage.Amount)
	require.Equal(t, types.HitTypeCrit|types.HitTypeMainHand, damage.HitType)
	require.Equal(t, types.PhysicalSchool, damage.School)
	require.Equal(t, "Auto Attack", *damage.SpellName)
	require.EqualValues(t, 1234, damage.Date().UnixMilli())
	require.Len(t, damage.Trailer, 3)
	require.EqualValues(t, 2, *damage.Trailer[0].Amount)
	require.EqualValues(t, 4, *damage.Trailer[1].Amount)
	require.EqualValues(t, 3, *damage.Trailer[2].Amount)
	death := decoded[1].(*messages.Slain)
	require.Equal(t, id, death.Victim)
	require.Nil(t, death.Killer)
	require.EqualValues(t, 1235, death.Date().UnixMilli())
}
