package instances

import (
	"context"
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
	"github.com/stretchr/testify/require"
)

func TestVezaxFinalizedVariants(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name                string
		boss, vapor, animus uint32
		vaporAt, animusAt   int
		kill                bool
		want                string
	}{
		{"normal 10", 33271, 33488, 33524, 20, 0, true, "normal"},
		{"normal 25", 33449, 33789, 34152, 20, 0, true, "normal"},
		{"hard 10", 33271, 33488, 33524, 0, 30, true, "hard"},
		{"hard 25", 33449, 33789, 34152, 0, 30, true, "hard"},
		{"vapor overrides animus", 33271, 33488, 33524, 20, 30, true, "normal"},
		{"vapor after animus overrides", 33271, 33488, 33524, 40, 30, true, "normal"},
		{"missing evidence", 33271, 33488, 33524, 0, 0, true, ""},
		{"animus after boss", 33271, 33488, 33524, 0, 102, true, ""},
		{"animus simultaneous with boss", 33271, 33488, 33524, 0, 101, true, ""},
		{"hard wipe", 33271, 33488, 33524, 0, 30, false, ""},
		{"normal wipe", 33271, 33488, 33524, 20, 0, false, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			flavor := database.WoWFlavor{database.FlavorWrath}
			ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
			inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
			start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			boss, player := creatureGUID(tc.boss), guid.GUID(1)
			for at := 0; at <= 102; at++ {
				base := messages.Base(start.Add(time.Duration(at) * time.Second))
				if at <= 100 && at%5 == 0 {
					require.NoError(t, inst.Process(&messages.Damage{MessageBase: base, Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}))
				}
				// Deaths alone must be usable, even if no damage to the add was logged.
				if at == tc.vaporAt && at > 0 {
					require.NoError(t, inst.Process(&messages.Slain{MessageBase: base, Victim: creatureGUID(tc.vapor)}))
				}
				if at == tc.animusAt && at > 0 {
					require.NoError(t, inst.Process(&messages.Slain{MessageBase: base, Victim: creatureGUID(tc.animus)}))
				}
				if at == 101 && tc.kill {
					require.NoError(t, inst.Process(&messages.Slain{MessageBase: base, Victim: boss}))
				}
			}
			result, err := inst.Finalize(ctx)
			require.NoError(t, err)
			require.Len(t, result.Encounters, 1)
			got := result.Encounters[0]
			require.Equal(t, tc.want, got.Variant)
			if tc.kill {
				require.Equal(t, encounter.KillTypeClean, got.KillType)
				require.Equal(t, start.Add(101*time.Second), got.Combat.End)
			}
		})
	}
}

func TestVezaxEvidenceScope(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss := creatureGUID(33271)
	for _, tc := range []struct {
		name      string
		at        int
		entry     uint32
		synthetic bool
		want      string
	}{
		{"animus before attempt", -1, 33524, false, ""},
		{"vapor before attempt", -1, 33488, false, "hard"},
		{"vapor after encounter", 101, 33488, false, "hard"},
		{"synthetic vapor", 30, 33488, true, "hard"},
		{"synthetic animus", 30, 33524, true, ""},
		{"unrelated death", 30, 33329, false, "hard"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			evidence := &vezaxVariantEvidence{}
			add := func(at int, entry uint32, synthetic bool) {
				base := messages.Base(start.Add(time.Duration(at) * time.Second))
				base.Synthetic = synthetic
				require.NoError(t, evidence.ProcessMessage(&messages.Slain{MessageBase: base, Victim: creatureGUID(entry)}))
			}
			add(100, 33271, false)
			if tc.entry != 33524 {
				add(20, 33524, false)
			}
			add(tc.at, tc.entry, tc.synthetic)
			enc := encounter.Encounter{Name: "General Vezax", Boss: true, KillType: encounter.KillTypeClean, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(100 * time.Second), Hostiles: map[guid.GUID]encounter.CharacterFight{boss: {}}}}
			pre := []instancehook.Preprocessor{evidence}
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
			enc.Combat.MapID = 1
			require.Empty(t, ulduarEncounterVariant(&enc, flavor, pre))
		})
	}
}

func TestVezaxSameGUIDRetry(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorWrath}
	ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
	inst := UlduarFactory.New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), unitdb.New(), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	boss, player := creatureGUID(33271), guid.GUID(1)
	for attempt := 0; attempt < 2; attempt++ {
		base := start.Add(time.Duration(attempt) * 300 * time.Second)
		for at := 0; at <= 80; at += 5 {
			mb := messages.Base(base.Add(time.Duration(at) * time.Second))
			require.NoError(t, inst.Process(&messages.Damage{MessageBase: mb, Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}))
			if at == 20 {
				entry := uint32(33488)
				if attempt == 1 {
					entry = 33524
				}
				require.NoError(t, inst.Process(&messages.Slain{MessageBase: mb, Victim: creatureGUID(entry)}))
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
	require.Equal(t, "hard", result.Encounters[0].Variant, "earlier Vapor death must not override the successful retry")
}
