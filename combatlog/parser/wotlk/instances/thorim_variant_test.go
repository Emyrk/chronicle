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

func TestThorimFinalizedVariants(t *testing.T) {
	t.Parallel()
	type auraEvent struct {
		at     int
		spell  int32
		state  types.AuraState
		target guid.GUID
	}
	for _, entry := range []uint32{32865, 33147} {
		boss := creatureGUID(entry)
		for _, tc := range []struct {
			name   string
			events []auraEvent
			want   string
		}{
			{"absent is hard", nil, "hard"},
			{"debuff is normal", []auraEvent{{105, 62565, types.AuraStateAdded, boss}}, "normal"},
			{"channel ignored", []auraEvent{{105, 62507, types.AuraStateAdded, boss}}, "hard"},
			{"channel does not override debuff", []auraEvent{{105, 62565, types.AuraStateAdded, boss}, {106, 62507, types.AuraStateAdded, boss}}, "normal"},
			{"player debuff ignored", []auraEvent{{105, 62565, types.AuraStateAdded, guid.GUID(1)}}, "hard"},
			{"other npc ignored", []auraEvent{{105, 62565, types.AuraStateAdded, creatureGUID(32845)}}, "hard"},
			{"active at pull", []auraEvent{{90, 62565, types.AuraStateAdded, boss}}, "normal"},
			{"removed before pull", []auraEvent{{90, 62565, types.AuraStateAdded, boss}, {95, 62565, types.AuraStateRemoved, boss}}, "hard"},
			{"expired before pull", []auraEvent{{50, 62565, types.AuraStateAdded, boss}}, "hard"},
			{"removed during fight", []auraEvent{{105, 62565, types.AuraStateAdded, boss}, {110, 62565, types.AuraStateRemoved, boss}}, "normal"},
			{"after kill ignored", []auraEvent{{125, 62565, types.AuraStateAdded, boss}}, "hard"},
		} {
			t.Run(fmt.Sprintf("%d/%s", entry, tc.name), func(t *testing.T) {
				t.Parallel()
				flavor := database.WoWFlavor{database.FlavorWrath}
				ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
				inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(flavor), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
				tracker := auras.New(nil)
				inst.AttachAuraProjection(tracker)
				process := func(m messages.Message) { require.NoError(t, inst.Process(m)); tracker.Process(m) }
				start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
				player := guid.GUID(1)
				for at := 0; at <= 130; at++ {
					base := messages.Base(start.Add(time.Duration(at) * time.Second))
					if at >= 100 && at <= 120 && at%5 == 0 {
						process(&messages.Damage{MessageBase: base, Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit})
					}
					for _, event := range tc.events {
						if event.at != at {
							continue
						}
						process(&messages.Aura{MessageBase: base, Target: event.target, SpellID: chrondbc.SpellID(event.spell), SpellData: &chrondbc.Spell{ID: chrondbc.SpellID(event.spell), Duration: chrondbc.SpellDuration{Duration: 30000, MaxDuration: 30000}}, State: event.state, Amount: 1})
					}
					if at == 121 {
						process(&messages.Slain{MessageBase: base, Victim: boss})
					}
				}
				result, err := inst.Finalize(ctx)
				require.NoError(t, err)
				require.Len(t, result.Encounters, 1)
				require.Equal(t, encounter.KillTypeClean, result.Encounters[0].KillType)
				require.Equal(t, tc.want, result.Encounters[0].Variant)
				require.Empty(t, result.Encounters[0].Combat.Difficulty)
			})
		}
	}

}

func TestThorimVariantScope(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, kill := range []encounter.KillType{encounter.KillTypeClean, encounter.KillTypePartial, encounter.KillTypeWipe, encounter.KillTypeReset, ""} {
		t.Run(string(kill), func(t *testing.T) {
			t.Parallel()
			enc := encounter.Encounter{Name: "Thorim", Boss: true, KillType: kill, VariantAuras: []int32{}, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(time.Minute)}}
			want := ""
			if kill == encounter.KillTypeClean || kill == encounter.KillTypePartial {
				want = "hard"
			}
			require.Equal(t, want, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{}, nil))
			enc.VariantAuras = nil
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
			enc.VariantAuras = []int32{}
			enc.Combat.End = start
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
		})
	}
}
