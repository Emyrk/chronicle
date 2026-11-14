package instances

import (
	"context"
	"fmt"
	"log/slog"
	"testing"
	"time"

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

func TestUlduarHodirVariantBoundaries(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		duration time.Duration
		want     string
	}{
		{179999 * time.Millisecond, "hard"}, {180 * time.Second, "normal"}, {180001 * time.Millisecond, "normal"},
	} {
		t.Run(fmt.Sprint(tc.duration), func(t *testing.T) {
			t.Parallel()
			flavor := database.WoWFlavor{database.FlavorWrath}
			ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
			instance := UlduarFactory.New(ctx, slog.Default(), unitdb.New(), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
			start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
			boss := creatureGUID(32845)
			player := guid.GUID(1)
			for at := time.Duration(0); at < tc.duration; at += 5 * time.Second {
				require.NoError(t, instance.Process(&messages.Damage{MessageBase: messages.Base(start.Add(at)), Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit}))
			}
			require.NoError(t, instance.Process(&messages.Slain{MessageBase: messages.Base(start.Add(tc.duration)), Victim: boss}))
			result, err := instance.Finalize(ctx)
			require.NoError(t, err)
			require.Len(t, result.Encounters, 1)
			got := result.Encounters[0]
			require.Equal(t, encounter.KillTypeClean, got.KillType)
			require.Equal(t, tc.duration, got.Combat.End.Sub(got.Combat.Start))
			require.Equal(t, tc.want, got.Variant)
			require.Empty(t, got.Combat.Difficulty, "variant must not replace raw difficulty")
		})
	}
}

func TestUlduarVariantScopeAndOutcomes(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name     string
		boss     string
		mapID    uint32
		kill     encounter.KillType
		duration time.Duration
		want     string
	}{
		{"partial successful kill", "Hodir", 603, encounter.KillTypePartial, time.Minute, "hard"},
		{"wipe", "Hodir", 603, encounter.KillTypeWipe, time.Minute, ""},
		{"reset", "Hodir", 603, encounter.KillTypeReset, time.Minute, ""},
		{"incomplete", "Hodir", 603, "", time.Minute, ""},
		{"zero duration", "Hodir", 603, encounter.KillTypeClean, 0, ""},
		{"negative duration", "Hodir", 603, encounter.KillTypeClean, -time.Second, ""},
		{"unsupported boss", "Freya", 603, encounter.KillTypeClean, time.Minute, ""},
		{"wrong instance", "Hodir", 1, encounter.KillTypeClean, time.Minute, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			enc := encounter.Encounter{Name: tc.boss, Boss: true, KillType: tc.kill, Combat: encounter.Fight{MapID: tc.mapID, Start: start, End: start.Add(tc.duration)}}
			require.Equal(t, tc.want, ulduarEncounterVariant(enc, database.WoWFlavor{database.FlavorWrath}, nil))
			require.Empty(t, ulduarEncounterVariant(enc, database.WoWFlavor{}, nil), "non-Wrath must stay unknown")
		})
	}
}
