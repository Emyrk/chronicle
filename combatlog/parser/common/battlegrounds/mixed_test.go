package battlegrounds_test

import (
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/blizzard/modern"
	"github.com/Emyrk/chronicle/combatlog/parser/common/battlegrounds"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/reorder"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

type mixedConsumer func(messages.Message) error

func (f mixedConsumer) Process(m messages.Message) error { return f(m) }

// This is one synthetic v22 file, not captured BG telemetry or a production map
// allowlist. Each prefix also exercises EOF inside a different kind of zone.
func mixedFixture(last int, pveOnly bool) string {
	lines := []string{`9/20/2026 12:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0,BUILD_VERSION,1.60.1,PROJECT_ID,18`}
	for i, mapID := range []int{100, 1, 101, 2, 999}[:last] {
		if pveOnly && mapID != 100 && mapID != 101 {
			continue
		}
		sec := i*10 + 1
		target := `Player-2-00000002`
		if mapID == 100 || mapID == 101 {
			target = fmt.Sprintf("Creature-0-1-%d-1-900099-1", mapID)
		}
		// Deliberately place damage before its earlier zone in the file. Reorder must
		// drain its EOF tail before either consumer is finalized.
		lines = append(lines, fmt.Sprintf(`9/20/2026 12:00:%02d.000  SPELL_DAMAGE,Player-2-00000001,"One",0x514,0,%s,"Boss",0xa48,0,1,"Spell",0x1,%d,%d,-1,1,0,0,0,nil,nil,nil`, sec+1, target, 10+i, 10+i))
		lines = append(lines, fmt.Sprintf(`9/20/2026 12:00:%02d.000  ZONE_CHANGE,%d,"Fixture %d",1`, sec, mapID, mapID))
	}
	return strings.Join(lines, "\n") + "\n"
}

func TestMixedModernStream(t *testing.T) {
	t.Parallel()
	for _, last := range []int{1, 2, 3, 4, 5} {
		t.Run(fmt.Sprintf("segments_%d", last), func(t *testing.T) {
			t.Parallel()
			run := func(pveOnly bool) ([]*instances.FinalizedInstance, [][]*chronicleproto.Damage, []battlegrounds.Recording) {
				logger := slog.New(slog.NewTextHandler(io.Discard, nil))
				hostiles := map[uint32]instances.Identity{}
				instances.LoadBosses(hostiles, map[uint32]string{900099: "Fixture Boss"})
				state := encounters.NewWithInstanceResolver(t.Context(), logger, database.WoWFlavor{}, func(_ bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
					if z.MapID != 100 && z.MapID != 101 {
						return nil
					}
					return instances.NewHookable(t.Context(), logger, db, z, instances.InstanceParams{
						Name: z.Name, MatchesZone: func(other zone.Zone) bool { return other.MapID == z.MapID }, Idf: identifier.NewIdentifier(hostiles),
					})
				})
				r := recorder(t)
				lifecycle, err := battlegrounds.New(database.LogFormatV22Cleu, known, nil)
				require.NoError(t, err)
				var bgMessages []*messages.Damage
				inspect := mixedConsumer(func(m messages.Message) error {
					if z, ok := m.(*messages.Zone); ok {
						if z.MapID == 100 || z.MapID == 101 {
							require.NotNil(t, state.CurrentInstance)
						} else {
							require.Nil(t, state.CurrentInstance, "unresolved zone must deselect PvE")
						}
					}
					if d, ok := m.(*messages.Damage); ok && state.CurrentInstance == nil {
						bgMessages = append(bgMessages, d)
					}
					return nil
				})
				p, err := modern.New(t.Context(), logger, strings.NewReader(mixedFixture(last, pveOnly)), fixtureDB{}, fixtureDB{}, nil, database.LogFormatV22Cleu)
				require.NoError(t, err)
				require.NoError(t, consumers.New(logger, r, lifecycle, state, inspect).ConsumeAll(t.Context(), reorder.New(p, time.Hour)))
				require.Equal(t, "22", state.CurrentVersions.Versions["combat_log"])
				// Mutation after the real PvE consumer and before Finish must not change BG
				// snapshots. The same pointers went through Consumers, not copied fixtures.
				for _, d := range bgMessages {
					d.Amount = 999
					d.SpellData.ID = 999
					d.ResetActivity()
				}
				before := lifecycle.Episodes()
				if !pveOnly && last%2 == 0 {
					require.NotEmpty(t, before)
					require.Empty(t, before[len(before)-1].CloseReason, "episode remains open until explicit Finish")
					require.True(t, before[len(before)-1].ExitAt.IsZero())
				}
				require.NoError(t, lifecycle.Finish())
				out := finished(t, r)
				for i, ep := range lifecycle.Episodes() {
					require.Equal(t, ep, out[i].Episode)
				}
				var results []*instances.FinalizedInstance
				var damage [][]*chronicleproto.Damage
				for _, inst := range state.Instances {
					result, err := inst.Finalize(t.Context())
					require.NoError(t, err)
					require.Len(t, result.Encounters, 1)
					require.Equal(t, state.CurrentVersions.Versions, result.Versions)
					results = append(results, result)
					enc := result.Encounters[0]
					var decoded []*chronicleproto.Damage
					for _, wire := range decodeStream(t, inst.Events().Damage, enc.Combat.EncounterID, enc.Combat.Start) {
						d := new(chronicleproto.Damage)
						require.NoError(t, proto.Unmarshal(wire, d))
						decoded = append(decoded, d)
					}
					require.Len(t, decoded, 1)
					damage = append(damage, decoded)
				}
				return results, damage, out
			}
			got, damage, bg := run(false)
			baseline, baselineDamage, baselineBG := run(true)
			require.Empty(t, baselineBG)
			require.Len(t, got, min((last+1)/2, 2))
			require.Len(t, got, len(baseline))
			require.Equal(t, baselineDamage, damage)
			for i := range got {
				require.EqualValues(t, 10+2*i, damage[i][0].Amount)
				require.EqualValues(t, 100+i, got[i].Encounters[0].Combat.MapID)
				require.Equal(t, baseline[i].Encounters[0].Name, got[i].Encounters[0].Name)
				require.Equal(t, baseline[i].Encounters[0].KillType, got[i].Encounters[0].KillType)
				wantCombat, gotCombat := baseline[i].Encounters[0].Combat, got[i].Encounters[0].Combat
				// UUIDs identify independently finalized payloads, not gameplay differences.
				gotCombat.EncounterID = wantCombat.EncounterID
				require.Equal(t, wantCombat, gotCombat)
			}
			require.Len(t, bg, last/2)
			for i, rec := range bg {
				require.EqualValues(t, i+1, rec.Episode.MapID)
				require.Equal(t, time.Date(2026, time.September, 20, 12, 0, 11+20*i, 0, time.UTC), rec.Episode.FirstObservedAt)
				wire := decodeStream(t, rec.Events.Damage, rec.PayloadID, rec.Episode.FirstObservedAt)
				require.Len(t, wire, 1)
				var d chronicleproto.Damage
				require.NoError(t, proto.Unmarshal(wire[0], &d))
				require.EqualValues(t, 11+i*2, d.Amount)
				require.EqualValues(t, 1, d.SpellData.Id)
				require.Equal(t, rec.Episode.FirstObservedAt.Add(time.Second), rec.Episode.LastObservedAt)
				if last == (i+1)*2 {
					require.Equal(t, battlegrounds.CloseEOF, rec.Episode.CloseReason)
					require.True(t, rec.Episode.ExitAt.IsZero())
				} else {
					require.Equal(t, battlegrounds.CloseZoneChange, rec.Episode.CloseReason)
					require.Equal(t, rec.Episode.FirstObservedAt.Add(10*time.Second), rec.Episode.ExitAt)
				}
			}
		})
	}
}
