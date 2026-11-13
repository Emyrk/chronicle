package serviceeventrepair

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

func TestRazorgoreUnknownAttributionOmissions(t *testing.T) {
	t.Parallel()
	for _, stream := range []database.LogInstanceEventType{database.LogInstanceEventTypeHeal, database.LogInstanceEventTypeAbsorbed, database.LogInstanceEventTypeDamage} {
		for _, targetUnknown := range []bool{false, true} {
			for _, p1 := range []bool{false, true} {
				t.Run(string(stream)+map[bool]string{false: "/source", true: "/target"}[targetUnknown]+map[bool]string{false: "/p2", true: "/p1"}[p1], func(t *testing.T) {
					t.Parallel()
					e := fixtureRazorgorePossession(t)
					unknown := "0xF140000001000029"
					caster, target := unknown, e.Rankings[0].PlayerGuid
					if stream == database.LogInstanceEventTypeDamage {
						target = e.Hostiles[0].ID.String()
					}
					if targetUnknown {
						caster = e.Rankings[1].PlayerGuid
						target = unknown
					}
					idx, offset := int32(75), int64(31000)
					if p1 {
						idx, offset = 35, 13926
					}
					var additions []proto.Message
					for j, amount := range []int32{100, 48} {
						meta := &chronicleproto.EventMeta{Index: idx + int32(j), OffsetMilli: offset + int64(j)}
						switch stream {
						case database.LogInstanceEventTypeHeal:
							additions = append(additions, &chronicleproto.Heal{Meta: meta, Caster: caster, Target: target, Amount: amount, SpellData: &chronicleproto.SpellData{Id: 36725}})
						case database.LogInstanceEventTypeAbsorbed:
							additions = append(additions, &chronicleproto.Absorbed{Meta: meta, Caster: caster, Target: target, Amount: amount})
						case database.LogInstanceEventTypeDamage:
							additions = append(additions, &chronicleproto.Damage{Meta: meta, Caster: &caster, Target: target, Amount: amount})
						}
					}
					for i, row := range e.Events {
						if row.Type != stream {
							continue
						}
						raw, err := razorgoreFrame(row.Events, e.Encounters[0].ID, e.Encounters[0].StartTime.Time)
						require.NoError(t, err)
						var events []proto.Message
						for _, b := range raw {
							var event proto.Message
							switch stream {
							case database.LogInstanceEventTypeHeal:
								event = &chronicleproto.Heal{}
							case database.LogInstanceEventTypeAbsorbed:
								event = &chronicleproto.Absorbed{}
							case database.LogInstanceEventTypeDamage:
								event = &chronicleproto.Damage{}
							}
							require.NoError(t, proto.Unmarshal(b, event))
							events = append(events, event)
						}
						e.Events[i].Events = numericFrame(t, e, append(events, additions...)...)
					}
					c := e.Encounters[0]
					report := &RazorgoreRepairPlan{}
					result, _, err := replayRazorgoreClassified(e, c, &encounter.RankingWindow{Start: c.StartTime.Time.Add(30 * time.Second), End: c.EndTime.Time}, database.LogFormat112aCcAddon, report)
					require.NoError(t, err)
					healer, _ := guid.FromString(e.Rankings[1].PlayerGuid)
					player, _ := guid.FromString(e.Rankings[0].PlayerGuid)
					require.EqualValues(t, 70, result.Units[healer].HealingDone, "never guess summon owner or credit its 148 healing to a player")
					require.EqualValues(t, 20, result.Units[healer].HealingAbsorbed)
					require.EqualValues(t, 250, result.Units[player].RankedDamageDone)
					if p1 {
						require.Empty(t, report.Warnings)
						return
					}
					rows := report.Details["omissions"].([]razorgoreOmission)
					require.Len(t, rows, 1)
					require.EqualValues(t, 148, rows[0].Amount)
					require.Equal(t, 2, rows[0].Count)
					require.Equal(t, unknown, rows[0].UnitGUID)
					require.Equal(t, string(stream), rows[0].Stream)
					require.Len(t, report.Warnings, 1)
				})
			}
		}
	}
}

func TestRazorgoreMalformedContributionStillRejects(t *testing.T) {
	t.Parallel()
	e := fixtureRazorgorePossession(t)
	for i, row := range e.Events {
		if row.Type == database.LogInstanceEventTypeHeal {
			e.Events[i].Events = numericFrame(t, e, &chronicleproto.Heal{Meta: &chronicleproto.EventMeta{Index: 75, OffsetMilli: 31000}, Caster: "0xF140000001000029", Target: e.Rankings[0].PlayerGuid, Amount: -148})
		}
	}
	c := e.Encounters[0]
	p := &RazorgoreRepairPlan{}
	_, _, err := replayRazorgoreClassified(e, c, &encounter.RankingWindow{Start: c.StartTime.Time.Add(30 * time.Second), End: c.EndTime.Time}, database.LogFormat112aCcAddon, p)
	require.ErrorContains(t, err, "invalid healing amount")
	require.Empty(t, p.Warnings)
}
