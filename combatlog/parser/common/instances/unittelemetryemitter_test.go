package instances

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUnitTelemetryEmitter_OnlyRegisteredForV22(t *testing.T) {
	t.Parallel()

	newHookable := func(format database.LogFormat) *Hookable {
		ctx := parsectx.With(context.Background(), parsectx.Context{Format: format})
		return NewHookable(ctx, slog.Default(), unitdb.New(), zone.Zone{}, InstanceParams{})
	}
	hasEmitter := func(h *Hookable) bool {
		for _, hook := range h.hooks {
			if _, ok := hook.(*UnitTelemetryEmitter); ok {
				return true
			}
		}
		return false
	}

	assert.True(t, hasEmitter(newHookable(database.LogFormatV22Cleu)))
	assert.False(t, hasEmitter(newHookable(database.LogFormatV9Cleu)))
}

func TestUnitTelemetryEmitter_FightStartEmitsPlayersAndActiveCharacters(t *testing.T) {
	t.Parallel()

	before := time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC)
	start := before.Add(time.Second)
	player := guid.GUID(1)
	creature := guid.GUID(0xF130000001000001)

	chars := characters.NewCharacters(unitdb.New(), nil, nil)
	activeCreature := characters.NewCommonCharacter(creature, chars)
	chars.All.Add(activeCreature, before)
	activeCreature.Start("test", &messages.Damage{MessageBase: messages.Base(before)})

	emitter := newUnitTelemetryEmitter(chars)
	var emitted []messages.Message
	emitter.emit = func(m messages.Message) { emitted = append(emitted, m) }

	for _, id := range []guid.GUID{player, creature} {
		require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, &messages.UnitPosition{
			MessageBase: messages.Base(before),
			Unit:        id,
			X:           float64(id),
		}))
		require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, &messages.UnitResources{
			MessageBase:   messages.Base(before),
			Unit:          id,
			CurrentHealth: 100,
			MaximumHealth: 100,
		}))
	}

	emitter.FightStarted(uuid.New(), &messages.Damage{MessageBase: messages.Base(start)})

	require.Len(t, emitted, 4)
	counts := make(map[guid.GUID]int)
	for _, m := range emitted {
		require.True(t, m.IsSynthetic())
		assert.Equal(t, start, m.Date())
		switch typed := m.(type) {
		case *messages.UnitPosition:
			counts[typed.Unit]++
		case *messages.UnitResources:
			counts[typed.Unit]++
		default:
			t.Fatalf("unexpected emitted message %T", m)
		}
	}
	assert.Equal(t, 2, counts[player])
	assert.Equal(t, 2, counts[creature])
}

func TestUnitTelemetryEmitter_ActiveCharacterSkipsTelemetryAlreadyEmitted(t *testing.T) {
	t.Parallel()

	before := time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC)
	activeAt := before.Add(time.Second)
	creature := guid.GUID(0xF130000001000001)

	chars := characters.NewCharacters(unitdb.New(), nil, nil)
	char := characters.NewCommonCharacter(creature, chars)
	char.Start("test", &messages.Damage{MessageBase: messages.Base(activeAt)})

	emitter := newUnitTelemetryEmitter(nil)
	var emitted []messages.Message
	emitter.emit = func(m messages.Message) { emitted = append(emitted, m) }

	position := &messages.UnitPosition{MessageBase: messages.Base(before), Unit: creature, X: 1}
	resources := &messages.UnitResources{MessageBase: messages.Base(before), Unit: creature, CurrentHealth: 100}
	require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, position))
	require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, resources))
	emitter.FightStarted(uuid.New(), &messages.Damage{MessageBase: messages.Base(activeAt)})
	require.Empty(t, emitted)

	// A real position entered the fight before the character became active. Only
	// the missing resource snapshot should be synthesized.
	require.NoError(t, emitter.ProcessMessage(true, uuid.New(), &messages.UnitPosition{
		MessageBase: messages.Base(activeAt),
		Unit:        creature,
		X:           2,
	}))
	emitter.ActivityChange(&messages.Damage{MessageBase: messages.Base(activeAt)}, char)

	require.Len(t, emitted, 1)
	resource, ok := emitted[0].(*messages.UnitResources)
	require.True(t, ok)
	assert.Equal(t, creature, resource.Unit)
}

func TestUnitTelemetryEmitter_ActivityMessageDoesNotDuplicateTelemetry(t *testing.T) {
	t.Parallel()

	before := time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC)
	activeAt := before.Add(time.Second)
	creature := guid.GUID(0xF130000001000001)

	chars := characters.NewCharacters(unitdb.New(), nil, nil)
	char := characters.NewCommonCharacter(creature, chars)
	char.Start("test", &messages.Damage{MessageBase: messages.Base(activeAt)})

	emitter := newUnitTelemetryEmitter(nil)
	var emitted []messages.Message
	emitter.emit = func(m messages.Message) { emitted = append(emitted, m) }
	require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, &messages.UnitPosition{
		MessageBase: messages.Base(before),
		Unit:        creature,
		X:           1,
	}))
	require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, &messages.UnitResources{
		MessageBase:   messages.Base(before),
		Unit:          creature,
		CurrentHealth: 100,
	}))
	emitter.FightStarted(uuid.New(), &messages.Damage{MessageBase: messages.Base(activeAt)})

	trigger := &messages.UnitPosition{MessageBase: messages.Base(activeAt), Unit: creature, X: 2}
	emitter.ActivityChange(trigger, char)

	require.Len(t, emitted, 1)
	_, ok := emitted[0].(*messages.UnitResources)
	require.True(t, ok)
}

func TestUnitTelemetryEmitter_DoesNotEmitDeadUnits(t *testing.T) {
	t.Parallel()

	before := time.Date(2026, 10, 13, 10, 0, 0, 0, time.UTC)
	player := guid.GUID(1)
	emitter := newUnitTelemetryEmitter(nil)
	var emitted []messages.Message
	emitter.emit = func(m messages.Message) { emitted = append(emitted, m) }

	require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, &messages.UnitPosition{
		MessageBase: messages.Base(before),
		Unit:        player,
	}))
	require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, &messages.UnitResources{
		MessageBase:   messages.Base(before),
		Unit:          player,
		CurrentHealth: 100,
	}))
	require.NoError(t, emitter.ProcessMessage(false, uuid.Nil, &messages.Slain{
		MessageBase: messages.Base(before.Add(time.Second)),
		Victim:      player,
	}))

	emitter.FightStarted(uuid.New(), &messages.Damage{MessageBase: messages.Base(before.Add(2 * time.Second))})
	assert.Empty(t, emitted)
}
