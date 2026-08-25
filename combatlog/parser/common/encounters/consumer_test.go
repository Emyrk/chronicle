package encounters

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

func TestZoneReentryDoesNotReuseDifferentDifficulty(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	state := NewWithInstanceResolver(ctx, logger, func(_ bool, firstZone zone.Zone, db *unitdb.Units) *instances.Hookable {
		if firstZone.Name != "naxxramas" {
			return nil
		}
		return instances.NewHookable(ctx, logger, db, firstZone, instances.InstanceParams{
			Name: "Naxxramas",
			MatchesZone: func(z zone.Zone) bool {
				return z.Name == "naxxramas"
			},
			Idf: identifier.NewIdentifier(map[uint32]instances.Identity{}),
		})
	})

	firstSeen := time.Date(2026, 8, 4, 21, 0, 0, 0, time.UTC)
	state.Zone(messages.Zone{Zone: zone.Zone{
		Seen:            firstSeen,
		Name:            "naxxramas",
		DifficultyIndex: 1,
		DifficultyName:  "10 Player",
		MaxPlayers:      10,
	}})
	state.Zone(messages.Zone{Zone: zone.Zone{
		Seen: firstSeen.Add(time.Minute),
		Name: "dalaran",
	}})
	require.Nil(t, state.CurrentInstance)

	state.Zone(messages.Zone{Zone: zone.Zone{
		Seen:            firstSeen.Add(2 * time.Minute),
		Name:            "naxxramas",
		DifficultyIndex: 2,
		DifficultyName:  "25 Player",
		MaxPlayers:      25,
	}})

	require.Len(t, state.Instances, 2)
	require.Equal(t, 10, state.Instances[0].CurrentZone.MaxPlayers)
	require.Equal(t, 25, state.Instances[1].CurrentZone.MaxPlayers)
	require.Same(t, state.Instances[1], state.CurrentInstance)
}

func TestVersionsApplyAcrossLogInstances(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	state := NewWithInstanceResolver(ctx, logger, func(_ bool, firstZone zone.Zone, db *unitdb.Units) *instances.Hookable {
		return instances.NewHookable(ctx, logger, db, firstZone, instances.InstanceParams{
			Name: firstZone.Name,
			MatchesZone: func(z zone.Zone) bool {
				return z.Name == firstZone.Name
			},
			Idf: identifier.NewIdentifier(map[uint32]instances.Identity{}),
		})
	})

	seen := time.Date(2026, 8, 25, 20, 0, 0, 0, time.UTC)
	state.Zone(messages.Zone{Zone: zone.Zone{Seen: seen, Name: "Obsidian Sanctum"}})
	originalVersions := map[string]string{"addon": "0.6.0"}
	state.CurrentInstance.SetVersions(originalVersions, nil)
	state.Zone(messages.Zone{Zone: zone.Zone{Seen: seen.Add(time.Hour), Name: "Naxxramas"}})

	versions := map[string]string{
		"addon":                     "0.7.0",
		"chronicle_companion_wotlk": "0.7.0",
		"wow":                       "3.3.5a",
	}
	require.NoError(t, state.Process(&messages.Versions{
		MessageBase: messages.Base(seen.Add(time.Hour + time.Minute)),
		Versions:    versions,
	}))

	state.Zone(messages.Zone{Zone: zone.Zone{Seen: seen.Add(2 * time.Hour), Name: "Eye of Eternity"}})
	require.Len(t, state.Instances, 3)

	wantVersions := []map[string]string{originalVersions, versions, versions}
	for i, instance := range state.Instances {
		finalized, err := instance.Finalize(ctx)
		require.NoError(t, err)
		require.Equal(t, wantVersions[i], finalized.Versions)
	}
}
