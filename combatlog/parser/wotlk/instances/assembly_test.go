package instances

import (
	"context"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestAssemblyVariantFinalization(t *testing.T) {
	t.Parallel()
	for _, entries := range [][3]uint32{{32857, 32927, 32867}, {33694, 33692, 33693}} {
		for last, want := range []string{"normal", "medium", "hard"} {
			t.Run(fmt.Sprintf("%d/%s", entries[0], want), func(t *testing.T) {
				t.Parallel()
				flavor := database.WoWFlavor{database.FlavorWrath}
				ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
				instance := UlduarFactory.New(ctx, slog.Default(), unitdb.New(flavor), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
				start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
				player := guid.GUID(1)
				for _, entry := range entries {
					require.NoError(t, instance.Process(&messages.Damage{MessageBase: messages.Base(start), Caster: &player, Target: creatureGUID(entry), Amount: 1, HitType: types.HitTypeHit}))
				}
				order := []int{(last + 1) % 3, (last + 2) % 3, last}
				for i, member := range order {
					require.NoError(t, instance.Process(&messages.Slain{MessageBase: messages.Base(start.Add(time.Duration(i+1) * time.Second)), Victim: creatureGUID(entries[member]), Killer: &player}))
				}
				result, err := instance.Finalize(ctx)
				require.NoError(t, err)
				require.Len(t, result.Encounters, 1)
				got := result.Encounters[0]
				require.Equal(t, "Assembly of Iron", got.Name)
				require.Equal(t, encounter.KillTypeClean, got.KillType)
				require.Equal(t, want, got.Variant)
				require.Equal(t, 3*time.Second, got.Combat.End.Sub(got.Combat.Start))
				require.Empty(t, got.Combat.Difficulty)
			})
		}
	}
}

func TestAssemblyVariantIncompleteEvidence(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name   string
		change func(*encounter.Encounter)
		want   string
	}{
		{"complete", func(*encounter.Encounter) {}, "hard"},
		{"partial with unrelated add", func(e *encounter.Encounter) {
			e.KillType = encounter.KillTypePartial
			e.Combat.Hostiles[creatureGUID(1)] = encounter.CharacterFight{}
		}, "hard"},
		{"wipe", func(e *encounter.Encounter) { e.KillType = encounter.KillTypeWipe }, ""},
		{"reset", func(e *encounter.Encounter) { e.KillType = encounter.KillTypeReset }, ""},
		{"unresolved", func(e *encounter.Encounter) { e.KillType = "" }, ""},
		{"wrong map", func(e *encounter.Encounter) { e.Combat.MapID = 1 }, ""},
		{"not boss", func(e *encounter.Encounter) { e.Boss = false }, ""},
		{"missing start", func(e *encounter.Encounter) { e.Combat.Start = time.Time{} }, ""},
		{"invalid duration", func(e *encounter.Encounter) { e.Combat.End = start }, ""},
		{"missing member", func(e *encounter.Encounter) { delete(e.Combat.Hostiles, creatureGUID(32857)) }, ""},
		{"missing activity", func(e *encounter.Encounter) { e.Combat.Hostiles[creatureGUID(32857)] = encounter.CharacterFight{} }, ""},
		{"duplicate member", func(e *encounter.Encounter) {
			e.Combat.Hostiles[creatureGUIDWithSeed(32857, 2)] = e.Combat.Hostiles[creatureGUID(32857)]
		}, ""},
		{"timeout", func(e *encounter.Encounter) {
			e.Combat.Hostiles[creatureGUID(32857)].Activity[0].EndState = period.EndStateTimeout
		}, ""},
		{"missing end", func(e *encounter.Encounter) { e.Combat.Hostiles[creatureGUID(32857)].Activity[0].End = nil }, ""},
		{"not a death event", func(e *encounter.Encounter) {
			e.Combat.Hostiles[creatureGUID(32857)].Activity[0].End.Timestamp = &messages.Damage{MessageBase: messages.Base(start.Add(time.Second))}
		}, ""},
		{"death outside fight", func(e *encounter.Encounter) { e.Combat.End = start.Add(2 * time.Second) }, ""},
		{"tied final deaths", func(e *encounter.Encounter) {
			e.Combat.Hostiles[creatureGUID(32927)].Activity[0].End.Timestamp = &messages.Slain{MessageBase: messages.Base(start.Add(3 * time.Second)), Victim: creatureGUID(32927)}
		}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			e := encounter.Encounter{Name: "Assembly of Iron", Boss: true, KillType: encounter.KillTypeClean, Combat: encounter.Fight{MapID: 603, Start: start, End: start.Add(3 * time.Second), Hostiles: map[guid.GUID]encounter.CharacterFight{}}}
			for i, entry := range []uint32{32857, 32927, 32867} {
				id := creatureGUID(entry)
				e.Combat.Hostiles[id] = encounter.CharacterFight{ID: id, Activity: []period.Period{{EndState: period.EndStateSlain, End: &period.Moment{Timestamp: &messages.Slain{MessageBase: messages.Base(start.Add(time.Duration(i+1) * time.Second)), Victim: id}}}}}
			}
			tc.change(&e)
			require.Equal(t, tc.want, ulduarEncounterVariant(&e, database.WoWFlavor{database.FlavorWrath}, nil))
			require.Empty(t, ulduarEncounterVariant(&e, database.WoWFlavor{}, nil))
		})
	}
}
