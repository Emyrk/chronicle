package instances

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
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

func TestFreyaFinalizedVariants(t *testing.T) {
	t.Parallel()
	for _, bossEntry := range []uint32{32906, 33360} {
		for trees := 0; trees <= 3; trees++ {
			for _, path := range []string{"cast", "aura", "both"} {
				t.Run(fmt.Sprintf("%d/%d/%s", bossEntry, trees, path), func(t *testing.T) {
					t.Parallel()
					flavor := database.WoWFlavor{database.FlavorWrath}
					ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
					inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(flavor), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
					start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
					boss, player := creatureGUID(bossEntry), guid.GUID(1)
					for at := 0; at <= 100; at += 5 {
						base := messages.Base(start.Add(time.Duration(at) * time.Second))
						damage := &messages.Damage{MessageBase: base, Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}
						if at == 100 {
							damage.Overkill = 1
						}
						require.NoError(t, inst.Process(damage))
						if at == 100 && bossEntry == 33360 {
							// Existing scripted surrender is canonical-Freya-only; an alias
							// with a real death still supports classification.
							require.NoError(t, inst.Process(&messages.Slain{MessageBase: base, Victim: boss}))
						}
						if at == 5 {
							for i, entries := range [][]uint32{{32915, 33391}, {32914, 33393}, {32913, 33392}} {
								if i >= trees {
									break
								}
								for _, entry := range entries {
									elder := creatureGUID(entry)
									if path != "aura" {
										require.NoError(t, inst.Process(&messages.SpellGo{MessageBase: base, Caster: elder, SpellID: 62467}))
									}
									if path != "cast" {
										require.NoError(t, inst.Process(&messages.Aura{MessageBase: base, Source: &elder, Target: elder, SpellID: 62467, Transition: messages.AuraTransitionApplied}))
									}
									if path == "both" && i < 2 {
										require.NoError(t, inst.Process(&messages.Aura{MessageBase: base, Source: &elder, Target: boss, SpellID: chrondbc.SpellID(62385 + i), Transition: messages.AuraTransitionApplied}))
									}
								}
							}
						}
					}
					result, err := inst.Finalize(ctx)
					require.NoError(t, err)
					require.Len(t, result.Encounters, 1)
					got := result.Encounters[0]
					require.Equal(t, fmt.Sprintf("trees_%d", trees), got.Variant)
					require.Equal(t, encounter.KillTypeClean, got.KillType)
					require.Equal(t, start, got.Combat.Start)
					require.Equal(t, start.Add(100*time.Second), got.Combat.End)
					require.Len(t, got.Combat.Hostiles, 1, "elders are not damage participants")
				})
			}
		}
	}
}

func TestFreyaEvidenceScope(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss, elder, other := creatureGUID(32906), creatureGUID(32915), creatureGUID(1)
	for _, tc := range []struct {
		name      string
		at        int
		kind      string
		target    guid.GUID
		synthetic bool
		want      string
	}{
		{"cast", 10, "cast", 0, false, "trees_1"},
		{"self cast", 10, "cast", elder, false, "trees_1"},
		{"wrong cast target", 10, "cast", boss, false, "trees_0"},
		{"self aura", 10, "aura", elder, false, "trees_1"},
		{"wrong aura target", 10, "aura", boss, false, "trees_0"},
		{"essence", 10, "essence", boss, false, "trees_1"},
		{"wrong essence target", 10, "essence", other, false, "trees_0"},
		{"nonparticipant freya", 10, "essence", creatureGUID(33360), false, "trees_0"},
		{"removal only", 10, "removed", elder, false, "trees_0"},
		{"synthetic cast", 10, "cast", 0, true, "trees_0"},
		{"synthetic aura", 10, "aura", elder, true, "trees_0"},
		{"synthetic essence", 10, "essence", boss, true, "trees_0"},
		{"before pull", -1, "cast", 0, false, "trees_0"},
		{"at pull", 0, "cast", 0, false, "trees_1"},
		{"at kill", 100, "cast", 0, false, "trees_1"},
		{"after kill", 101, "cast", 0, false, "trees_0"},
		{"wrong caster", 10, "wrong caster", 0, false, "trees_0"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			e := &freyaVariantEvidence{}
			base := messages.Base(start.Add(time.Duration(tc.at) * time.Second))
			base.Synthetic = tc.synthetic
			var msg messages.Message
			switch tc.kind {
			case "cast", "wrong caster":
				caster := elder
				if tc.kind == "wrong caster" {
					caster = boss
				}
				cast := &messages.SpellGo{MessageBase: base, Caster: caster, SpellID: 62467}
				if tc.target != 0 {
					cast.Target = &tc.target
				}
				msg = cast
			default:
				spell := chrondbc.SpellID(62467)
				if tc.kind == "essence" {
					spell = 62385
				}
				transition := messages.AuraTransitionApplied
				if tc.kind == "removed" {
					transition = messages.AuraTransitionRemoved
				}
				msg = &messages.Aura{MessageBase: base, Source: &elder, Target: tc.target, SpellID: spell, Transition: transition}
			}
			require.NoError(t, e.ProcessMessage(msg))
			// A kill-time fade must not erase an earlier observation.
			require.NoError(t, e.ProcessMessage(&messages.Aura{MessageBase: messages.Base(start.Add(100 * time.Second)), Source: &elder, Target: elder, SpellID: 62467, Transition: messages.AuraTransitionRemoved}))
			enc := encounter.Encounter{Name: "Freya", Boss: true, KillType: encounter.KillTypeClean, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(100 * time.Second), Hostiles: map[guid.GUID]encounter.CharacterFight{boss: {}}}}
			pre := []instancehook.Preprocessor{e}
			flavor := database.WoWFlavor{database.FlavorWrath}
			require.Equal(t, tc.want, ulduarEncounterVariant(&enc, flavor, pre))
			require.Empty(t, ulduarEncounterVariant(&enc, database.WoWFlavor{}, pre))
			for _, kill := range []encounter.KillType{encounter.KillTypePartial, encounter.KillTypeWipe, encounter.KillTypeReset, ""} {
				enc.KillType = kill
				want := ""
				if kill == encounter.KillTypePartial {
					want = tc.want
				}
				require.Equal(t, want, ulduarEncounterVariant(&enc, flavor, pre))
			}
			enc.KillType = encounter.KillTypeClean
			enc.Combat.End = start
			require.Empty(t, ulduarEncounterVariant(&enc, flavor, pre))
			enc.Combat.End = start.Add(time.Minute)
			enc.Combat.Start = time.Time{}
			require.Empty(t, ulduarEncounterVariant(&enc, flavor, pre))
		})
	}
}

func TestFreyaSameGUIDRetry(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorWrath}
	ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
	inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(database.WoWFlavor{database.FlavorWrath}), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss, player := creatureGUID(32906), guid.GUID(1)
	for attempt := 0; attempt < 2; attempt++ {
		base := start.Add(time.Duration(attempt) * 300 * time.Second)
		for at := 0; at <= 80; at += 5 {
			mb := messages.Base(base.Add(time.Duration(at) * time.Second))
			require.NoError(t, inst.Process(&messages.Damage{MessageBase: mb, Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}))
			if at == 20 && attempt == 0 {
				require.NoError(t, inst.Process(&messages.SpellGo{MessageBase: mb, Caster: creatureGUID(32913), SpellID: 62467}))
			}
		}
		if attempt == 1 {
			require.NoError(t, inst.Process(&messages.Slain{MessageBase: messages.Base(base.Add(81 * time.Second)), Victim: boss}))
		}
	}
	result, err := inst.Finalize(ctx)
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Len(t, result.Encounters[0].Combat.Hostiles[boss].Activity, 2)
	require.Equal(t, "trees_0", result.Encounters[0].Variant, "earlier elder evidence must not leak into the successful retry")
}
