package chronicle

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

// No DB, storage, encounter registry or publication is needed for this minimal
// report fixture. Unexpected use of other GameDB methods fails rather than
// silently returning plausible data.
type reportGameDB struct{ gamedb.GameDB }

func (reportGameDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, chrondbc.SpellNotFound(id)
}
func (reportGameDB) DurationModifiers(context.Context) (*chrondbc.DurationModifierSet, error) {
	return &chrondbc.DurationModifierSet{}, nil
}

func TestBaselineVanillaParseReport(t *testing.T) {
	t.Parallel()
	input := strings.Join([]string{
		"1|HEAL|0x0000000000000001|0x0000000000000002|123|100|0|0",
		"1|ENERGIZE|0x0000000000000001|0x0000000000000002|124|0|1|0",
		"1|SPELL_FAIL|client-side|125|false", // intentional drop still consumes a line
		"malformed",                          // recoverable record failure still consumes a physical line
	}, "\n")
	for _, engine := range []BaselineEngine{BaselineLegacy, BaselineParserNextVanilla} {
		t.Run(string(engine), func(t *testing.T) {
			t.Parallel()
			c := &Chronicle{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
			worker := &WorkerLogParse{parent: c, baselineEngine: engine}
			result, err := worker.parseCombatLog(t.Context(), database.LogFormat112aCcAddon, nil, nil, reportGameDB{}, nil, false, []byte(input), "")
			require.NoError(t, err)
			if engine == BaselineParserNextVanilla {
				require.EqualValues(t, 4, result.report.totalLines)
				source := result.consumers.Advancer.(*nextsource.Source)
				require.Equal(t, 1, source.MissedSpells()[123].Count)
				require.NotContains(t, source.MissedSpells(), chrondbc.SpellID(124))
				require.NotContains(t, source.MissedSpells(), chrondbc.SpellID(125))
			} else {
				// Characterize the pre-existing CC-v2 report, not a silently repaired one.
				require.Zero(t, result.report.totalLines)
				parser := result.consumers.Advancer.(*parserv2.Parser)
				require.Equal(t, 1, parser.MissedSpells()[123].Count)
				require.NotContains(t, parser.MissedSpells(), chrondbc.SpellID(124))
			}
			// Counters really are populated above. The current named-type mismatch
			// nevertheless leaves the report nil in both engines, independently of EOF.
			require.Nil(t, result.report.missedSpells)
			// Source.DetailedTimes already forwards to Pipeline; Consumers.Times
			// merges those exact values into the report without another adapter.
			for key, value := range result.consumers.Times() {
				require.Equal(t, value, result.report.consumerTimes[key], key)
			}
			for _, key := range []string{"parser", "parser.line_parse", "parser.synthetics", "parser.synthetic.slain", "parser.synthetic.aura_ownership", "parser.synthetic.absorption", "encounter_state.total"} {
				require.Contains(t, result.report.consumerTimes, key)
				require.GreaterOrEqual(t, result.report.consumerTimes[key].Nanoseconds(), int64(0))
			}
		})
	}
}
