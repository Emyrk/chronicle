package instances

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestUnitTelemetryGraphDeferredRuntime(t *testing.T) {
	t.Parallel()
	for _, configured := range []bool{false, true} {
		name := "absent"
		if configured {
			name = "configured"
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			idRecipe := identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
			id, err := idRecipe.New()
			require.NoError(t, err)
			recipe := characters.TrustedFactoryRecipe{ID: "telemetry"}
			chars, err := recipe.New(unitdb.New(), id)
			require.NoError(t, err)
			source := newUnitTelemetryEmitter(chars)
			calls := 0
			emit := func(messages.Message) { calls++ }
			if configured {
				source.emit = emit
			}
			at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			require.NoError(t, source.ProcessMessage(true, uuid.Nil, &messages.UnitPosition{MessageBase: messages.Base(at), Unit: 1, X: 4}))
			require.NoError(t, source.ProcessMessage(true, uuid.Nil, &messages.UnitResources{MessageBase: messages.Base(at), Unit: 1, CurrentHealth: 100}))
			source.fightActive = true
			r := ownergraph.NewRegistry()
			require.NoError(t, RegisterUnitTelemetryGraphOwner(r))
			require.NoError(t, characters.RegisterGraphOwners(r, characters.GraphOptions{Factories: recipe, Identifier: idRecipe}))
			require.NoError(t, identifier.RegisterGraphOwner(r, idRecipe))
			require.NoError(t, unitdb.RegisterGraphOwner(r))
			snapshot, err := r.Capture(source)
			require.NoError(t, err)
			data, err := json.Marshal(snapshot)
			require.NoError(t, err)
			path := filepath.Join(t.TempDir(), "snapshot.json")
			require.NoError(t, os.WriteFile(path, data, 0600))
			data, err = os.ReadFile(path)
			require.NoError(t, err)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(data, &disk))
			restored, err := r.Restore(disk)
			require.NoError(t, err)
			fresh := restored.(*UnitTelemetryEmitter)
			require.Nil(t, fresh.emit)
			require.Equal(t, configured, fresh.GraphHasEmitter())
			require.NotSame(t, chars, fresh.GraphCharacters())
			require.NotNil(t, fresh.GraphCharacters())
			require.Equal(t, source.positions, fresh.positions)
			require.Equal(t, source.resources, fresh.resources)
			require.Equal(t, source.emittedPosition, fresh.emittedPosition)
			require.Equal(t, source.emittedResource, fresh.emittedResource)
			require.Equal(t, source.fightActive, fresh.fightActive)
			_, err = fresh.CaptureState()
			require.Error(t, err)
			if configured {
				require.Error(t, fresh.WireGraphRuntime(nil))
				require.NoError(t, fresh.WireGraphRuntime(emit))
			} else {
				require.Error(t, fresh.WireGraphRuntime(emit))
				require.NoError(t, fresh.WireGraphRuntime(nil))
			}
			require.Error(t, fresh.WireGraphRuntime(emit))
			require.Zero(t, calls)
			require.NoError(t, fresh.GraphCharacters().WireGraphRuntime())
			after, err := r.Capture(fresh)
			require.NoError(t, err)
			require.Equal(t, snapshot, after)
		})
	}
}
