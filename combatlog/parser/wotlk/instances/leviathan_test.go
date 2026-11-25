package instances

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestLeviathanFinalizedVariants(t *testing.T) {
	t.Parallel()
	type auraEvent struct {
		at           int
		spell        int32
		state        types.AuraState
		playerTarget bool
	}
	for _, tc := range []struct {
		name   string
		prior  bool
		events []auraEvent
		want   string
	}{
		{"zero with coverage", true, nil, "towers_0"},
		{"standalone zero towers", false, nil, "towers_0"},
		{"standalone one tower", false, []auraEvent{{105, 65075, types.AuraStateAdded, false}}, "towers_1"},
		{"expired before pull", true, []auraEvent{{50, 65075, types.AuraStateAdded, false}}, "towers_0"},
		{"refresh during fight", true, []auraEvent{{105, 65075, types.AuraStateModified, false}}, "towers_1"},
		{"active at pull", true, []auraEvent{{90, 65075, types.AuraStateAdded, false}}, "towers_1"},
		{"removed before pull", true, []auraEvent{{90, 65075, types.AuraStateAdded, false}, {95, 65075, types.AuraStateRemoved, false}}, "towers_0"},
		{"removal only is not evidence", true, []auraEvent{{110, 65075, types.AuraStateRemoved, false}}, "towers_0"},
		{"in fight then removed", true, []auraEvent{{105, 65075, types.AuraStateAdded, false}, {110, 65075, types.AuraStateRemoved, false}}, "towers_1"},
		{"duplicate applications", true, []auraEvent{{105, 65075, types.AuraStateAdded, false}, {110, 65075, types.AuraStateAdded, false}}, "towers_1"},
		{"player does not count", true, []auraEvent{{105, 65075, types.AuraStateAdded, true}}, "towers_0"},
		{"after kill does not count", true, []auraEvent{{125, 65075, types.AuraStateAdded, false}}, "towers_0"},
		{"earlier fight does not leak", true, []auraEvent{{0, 65075, types.AuraStateAdded, false}, {10, 65075, types.AuraStateRemoved, false}}, "towers_0"},
		{"two", true, []auraEvent{{105, 65075, types.AuraStateAdded, false}, {106, 65076, types.AuraStateAdded, false}}, "towers_2"},
		{"three", true, []auraEvent{{105, 65075, types.AuraStateAdded, false}, {106, 65076, types.AuraStateAdded, false}, {107, 64482, types.AuraStateAdded, false}}, "towers_3"},
		{"four without coverage", false, []auraEvent{{105, 65075, types.AuraStateAdded, false}, {106, 65076, types.AuraStateAdded, false}, {107, 64482, types.AuraStateAdded, false}, {108, 65077, types.AuraStateAdded, false}}, "towers_4"},
		{"frost alias", false, []auraEvent{{105, 65079, types.AuraStateAdded, false}}, "towers_1"},
		{"frost deduplication", false, []auraEvent{{105, 65077, types.AuraStateAdded, false}, {106, 65079, types.AuraStateAdded, false}}, "towers_1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			flavor := database.WoWFlavor{database.FlavorWrath}
			ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
			inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(database.WoWFlavor{database.FlavorWrath}), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
			tracker := auras.New(nil)
			inst.AttachAuraProjection(tracker)
			// Match consumer ordering: instance hooks first, canonical tracker second.
			process := func(m messages.Message) { require.NoError(t, inst.Process(m)); tracker.Process(m) }
			start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			player, boss, prior := guid.GUID(1), creatureGUID(33113), creatureGUID(32845)
			for at := 0; at <= 130; at++ {
				base := messages.Base(start.Add(time.Duration(at) * time.Second))
				if tc.prior && at == 0 {
					process(&messages.Damage{MessageBase: base, Caster: &player, Target: prior, Amount: 1, HitType: types.HitTypeHit})
				}
				if tc.prior && at == 1 {
					process(&messages.Slain{MessageBase: base, Victim: prior})
				}
				if at >= 100 && at <= 120 && at%5 == 0 {
					process(&messages.Damage{MessageBase: base, Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit})
				}
				for _, event := range tc.events {
					if event.at != at {
						continue
					}
					target := boss
					if event.playerTarget {
						target = player
					}
					process(&messages.Aura{MessageBase: base, Target: target, SpellData: &chrondbc.Spell{ID: chrondbc.SpellID(event.spell), Duration: chrondbc.SpellDuration{Duration: 30_000, MaxDuration: 30_000}}, SpellID: chrondbc.SpellID(event.spell), State: event.state, Amount: 1, IsBuff: true})
				}
				if at == 121 {
					process(&messages.Slain{MessageBase: base, Victim: boss})
				}
			}
			result, err := inst.Finalize(ctx)
			require.NoError(t, err)
			var got *encounter.Encounter
			for i := range result.Encounters {
				if result.Encounters[i].Name == "Flame Leviathan" {
					got = &result.Encounters[i]
				}
			}
			require.NotNil(t, got)
			require.Equal(t, encounter.KillTypeClean, got.KillType)
			require.Equal(t, tc.want, got.Variant)
			require.Equal(t, start.Add(100*time.Second), got.Combat.Start)
			require.Equal(t, start.Add(121*time.Second), got.Combat.End)
		})
	}
}

func TestLeviathanClassificationEligibility(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, kill := range []encounter.KillType{encounter.KillTypeClean, encounter.KillTypePartial, encounter.KillTypeWipe, encounter.KillTypeReset} {
		t.Run(fmt.Sprint(kill), func(t *testing.T) {
			t.Parallel()
			enc := encounter.Encounter{Name: "Flame Leviathan", Boss: true, KillType: kill, HasEarlierEncounter: false, VariantAuras: []int32{}, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(time.Minute)}}
			want := ""
			if kill == encounter.KillTypeClean || kill == encounter.KillTypePartial {
				want = "towers_0"
			}
			require.Equal(t, want, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{}, nil))
			enc.VariantAuras = nil
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil), "missing tracker is not zero towers")
			enc.VariantAuras = []int32{}
			enc.Combat.MapID = 1
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
		})
	}
}
