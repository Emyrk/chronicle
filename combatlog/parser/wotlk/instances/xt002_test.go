package instances

import (
	"context"
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
	"io"
	"log/slog"
	"testing"
	"time"
)

// Minimal deterministic events model the observed 64193 and 63849 wire signals.
// Names/player IDs are synthetic. No raw user log is included.
func TestXTFinalizedVariants(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		hard   bool
		phases int
		kill   bool
		want   string
	}{
		{"hard", true, 1, true, "hard"}, {"normal", false, 3, true, "normal"}, {"normal long finish", false, 3, true, "normal"},
		{"incomplete phase coverage", false, 2, true, ""}, {"hard wipe", true, 1, false, ""},
		{"normal wipe", false, 3, false, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			flavor := database.WoWFlavor{database.FlavorWrath}
			ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
			inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
			start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			boss, heart, player := creatureGUID(33293), creatureGUID(33329), guid.GUID(1)
			aura := func(at int, unit guid.GUID, spell chrondbc.SpellID, tr messages.AuraTransition) {
				require.NoError(t, inst.Process(&messages.Aura{MessageBase: messages.Base(start.Add(time.Duration(at) * time.Second)), Source: &unit, Target: unit, SpellID: spell, Transition: tr, IsBuff: true}))
			}
			finish := 100
			if tc.name == "normal long finish" {
				finish = 200
			}
			for at := 0; at <= finish; at += 5 {
				require.NoError(t, inst.Process(&messages.Damage{MessageBase: messages.Base(start.Add(time.Duration(at) * time.Second)), Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}))
				if at >= 20 && at < 20+tc.phases*20 {
					if at%20 == 0 {
						aura(at, heart, 63849, messages.AuraTransitionApplied)
					}
					require.NoError(t, inst.Process(&messages.Damage{MessageBase: messages.Base(start.Add(time.Duration(at) * time.Second)), Caster: &player, Target: heart, Amount: 1, HitType: types.HitTypeHit}))
					if at%20 == 10 {
						aura(at, heart, 63849, messages.AuraTransitionRemoved)
					}
				}
				if tc.hard && at == 35 {
					require.NoError(t, inst.Process(&messages.Slain{MessageBase: messages.Base(start.Add(35 * time.Second)), Victim: heart}))
					aura(at, boss, 64193, messages.AuraTransitionApplied)
				}
			}
			if tc.kill {
				require.NoError(t, inst.Process(&messages.Slain{MessageBase: messages.Base(start.Add(time.Duration(finish+1) * time.Second)), Victim: boss}))
			}
			result, err := inst.Finalize(ctx)
			require.NoError(t, err)
			require.Len(t, result.Encounters, 1)
			got := result.Encounters[0]
			require.Equal(t, tc.want, got.Variant)
			if tc.kill {
				require.Equal(t, encounter.KillTypeClean, got.KillType)
				require.Equal(t, start.Add(time.Duration(finish+1)*time.Second), got.Combat.End, "heart must not leave timeout tail")
			} else {
				require.NotEqual(t, encounter.KillTypeClean, got.KillType)
			}
		})
	}
}

func TestXTEvidenceAttemptIsolation(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss, heart := creatureGUID(33293), creatureGUID(33329)
	e := &xtVariantEvidence{}
	add := func(at int, unit guid.GUID, spell chrondbc.SpellID, tr messages.AuraTransition) {
		require.NoError(t, e.ProcessMessage(&messages.Aura{MessageBase: messages.Base(start.Add(time.Duration(at) * time.Second)), Source: &unit, Target: unit, SpellID: spell, Transition: tr}))
	}
	add(1, boss, 64193, messages.AuraTransitionApplied)
	enc := encounter.Encounter{Name: "XT-002 Deconstructor", Boss: true, KillType: encounter.KillTypeClean, Combat: encounter.Fight{MapID: 603, Start: start.Add(100 * time.Second), End: start.Add(200 * time.Second), Hostiles: map[guid.GUID]encounter.CharacterFight{boss: {}, heart: {}}}}
	add(110, boss, 64193, messages.AuraTransitionRemoved)
	require.Empty(t, e.variant(enc), "old application and corpse fade cannot leak to reused GUID")
	for i := 0; i < 3; i++ {
		add(120+i*20, heart, 63849, messages.AuraTransitionApplied)
		add(130+i*20, heart, 63849, messages.AuraTransitionRemoved)
	}
	require.Equal(t, "normal", e.variant(enc))
	require.NoError(t, e.ProcessMessage(&messages.Slain{MessageBase: messages.Base(start.Add(175 * time.Second)), Victim: heart}))
	require.Empty(t, e.variant(enc), "heart death without Heartbreak is not a proven normal or hard mode")
	add(180, boss, 64193, messages.AuraTransitionApplied)
	require.Equal(t, "hard", e.variant(enc), "observed hard signal wins over phase coverage")
}

func TestXTVariantScopeAndOutcomes(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss := creatureGUID(33293)
	evidence := &xtVariantEvidence{observations: []xtAuraEvidence{{at: start.Add(time.Second), unit: boss, heartBreak: true, transition: messages.AuraTransitionApplied}}}
	for _, kill := range []encounter.KillType{encounter.KillTypeClean, encounter.KillTypePartial, encounter.KillTypeWipe, encounter.KillTypeReset, ""} {
		enc := encounter.Encounter{Name: "XT-002 Deconstructor", Boss: true, KillType: kill, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(2 * time.Second), Hostiles: map[guid.GUID]encounter.CharacterFight{boss: {}}}}
		pre := []instancehook.Preprocessor{evidence}
		want := ""
		if kill == encounter.KillTypeClean || kill == encounter.KillTypePartial {
			want = "hard"
		}
		require.Equal(t, want, ulduarEncounterVariant(enc, database.WoWFlavor{database.FlavorWrath}, pre))
		require.Empty(t, ulduarEncounterVariant(enc, database.WoWFlavor{}, pre))
		enc.Combat.MapID = 1
		require.Empty(t, ulduarEncounterVariant(enc, database.WoWFlavor{database.FlavorWrath}, pre))
	}
}

func TestXTSameGUIDRetryDoesNotInheritHardMode(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorWrath}
	ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
	inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss, heart, player := creatureGUID(33293), creatureGUID(33329), guid.GUID(1)
	for attempt := 0; attempt < 2; attempt++ {
		base := start.Add(time.Duration(attempt) * 300 * time.Second)
		aura := func(at int, unit guid.GUID, spell chrondbc.SpellID, tr messages.AuraTransition) {
			require.NoError(t, inst.Process(&messages.Aura{MessageBase: messages.Base(base.Add(time.Duration(at) * time.Second)), Source: &unit, Target: unit, SpellID: spell, Transition: tr}))
		}
		for at := 0; at <= 80; at += 5 {
			require.NoError(t, inst.Process(&messages.Damage{MessageBase: messages.Base(base.Add(time.Duration(at) * time.Second)), Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}))
			if attempt == 0 && at == 5 {
				aura(at, boss, 64193, messages.AuraTransitionApplied)
			}
			if attempt == 1 && at >= 20 && at <= 70 {
				if at%20 == 0 {
					aura(at, heart, 63849, messages.AuraTransitionApplied)
				}
				require.NoError(t, inst.Process(&messages.Damage{MessageBase: messages.Base(base.Add(time.Duration(at) * time.Second)), Caster: &player, Target: heart, Amount: 1, HitType: types.HitTypeHit}))
				if at%20 == 10 {
					aura(at, heart, 63849, messages.AuraTransitionRemoved)
				}
			}
		}
		if attempt == 1 {
			require.NoError(t, inst.Process(&messages.Slain{MessageBase: messages.Base(base.Add(81 * time.Second)), Victim: boss}))
		}
	}
	result, err := inst.Finalize(ctx)
	require.NoError(t, err)
	// With no intervening rows the generic grouper retains both activity
	// periods in one encounter. Only the successful period may supply evidence.
	require.Len(t, result.Encounters, 1)
	require.Len(t, result.Encounters[0].Combat.Hostiles[boss].Activity, 2)
	require.Equal(t, "normal", result.Encounters[0].Variant)
	require.Equal(t, encounter.KillTypeClean, result.Encounters[0].KillType)
}
