package instances

import (
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestMimironFinalizedVariants(t *testing.T) {
	t.Parallel()
	for _, entry := range []uint32{33432, 34106, 33651, 33670, 33350, 32845, 0} {
		for _, spell := range []int32{65101, 64582, 12345, 0} {
			t.Run(fmt.Sprintf("%d/%d", entry, spell), func(t *testing.T) {
				t.Parallel()
				inst := newUlduarTestInstance(t)
				tracker := auras.New(nil)
				inst.AttachAuraProjection(tracker)
				process := func(m messages.Message) { require.NoError(t, inst.Process(m)); tracker.Process(m) }
				start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
				player := guid.GUID(1)
				mkEntry := uint32(33432)
				if entry == 34106 {
					mkEntry = entry
				}
				machines := []guid.GUID{creatureGUID(mkEntry), creatureGUID(33651), creatureGUID(33670)}
				// Reuse machine GUIDs across attempts: first-pull evidence must not leak.
				for attempt := 0; attempt < 2; attempt++ {
					base := start.Add(time.Duration(attempt) * 5 * time.Minute)
					damage := func(at int, target guid.GUID) {
						process(&messages.Damage{MessageBase: messages.Base(base.Add(time.Duration(at) * time.Second)), Caster: &player, Target: target, Amount: 1, HitType: types.HitTypeHit})
					}
					slain := func(at int, target guid.GUID) {
						process(&messages.Slain{MessageBase: messages.Base(base.Add(time.Duration(at) * time.Second)), Victim: target, Killer: &player})
					}
					for phase, machine := range machines {
						at := phase * 20
						damage(at, machine)
						target := creatureGUID(entry)
						if entry == 0 {
							target = player
						}
						// Wrong targets are observed during phase one; valid targets in their own phase.
						if attempt == 0 && spell != 0 && (target == machine || (phase == 0 && entry != mkEntry && entry != 33651 && entry != 33670)) {
							for index, state := range []types.AuraState{types.AuraStateAdded, types.AuraStateRemoved} {
								process(&messages.Aura{MessageBase: messages.Base(base.Add(time.Duration(at+1+index) * time.Second)), Target: target, SpellData: &chrondbc.Spell{ID: chrondbc.SpellID(spell)}, SpellID: chrondbc.SpellID(spell), State: state, Amount: 1, IsBuff: true})
							}
						}
						slain(at+10, machine)
					}
					for i, machine := range machines {
						damage(60+i, machine)
					}
					for i, machine := range machines {
						slain(70+i, machine)
					}
				}
				result, err := inst.Finalize(t.Context())
				require.NoError(t, err)
				require.Len(t, result.Encounters, 2)
				want := "normal"
				if (entry == mkEntry || entry == 33651 || entry == 33670) && (spell == 65101 || spell == 64582) {
					want = "hard"
				}
				for i, enc := range result.Encounters {
					require.Equal(t, "Mimiron", enc.Name)
					require.Equal(t, encounter.KillTypeClean, enc.KillType)
					require.Len(t, enc.Phases, 4)
					if i == 0 {
						require.Equal(t, want, enc.Variant)
					} else {
						require.Equal(t, "normal", enc.Variant)
					}
				}
			})
		}
	}
}

func TestMimironClassificationEligibility(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, kill := range []encounter.KillType{encounter.KillTypeClean, encounter.KillTypePartial, encounter.KillTypeWipe, encounter.KillTypeReset} {
		t.Run(fmt.Sprint(kill), func(t *testing.T) {
			t.Parallel()
			enc := encounter.Encounter{Name: "Mimiron", Boss: true, KillType: kill, HasEarlierEncounter: false, VariantAuras: []int32{}, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(time.Minute)}}
			want := ""
			if kill == encounter.KillTypeClean || kill == encounter.KillTypePartial {
				want = "normal"
			}
			require.Equal(t, want, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
			enc.VariantAuras = []int32{65101, 64582}
			if want != "" {
				want = "hard"
			}
			require.Equal(t, want, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))

			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{}, nil))
			enc.VariantAuras = nil
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil), "missing tracker is not normal")
			enc.VariantAuras = []int32{}
			enc.Combat.MapID = 1
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
		})
	}
}

func TestMimironInvalidEncounter(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, times := range [][2]time.Time{{{}, start}, {start, {}}, {start, start}, {start, start.Add(-time.Second)}} {
		enc := encounter.Encounter{Name: "Mimiron", Boss: true, KillType: encounter.KillTypeClean, VariantAuras: []int32{65101}, Combat: encounter.Fight{MapID: 603, Start: times[0], End: times[1]}}
		require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
	}
	enc := encounter.Encounter{Name: "Mimiron", KillType: encounter.KillTypeClean, VariantAuras: []int32{65101}, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(time.Minute)}}
	require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{database.FlavorWrath}, nil))
}
