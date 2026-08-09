package instances

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

const preprocessorTestBossEntry uint32 = 900002

type targetPreprocessor struct {
	from guid.GUID
	to   guid.GUID
}

func (p targetPreprocessor) ProcessMessage(msg messages.Message) error {
	damage, ok := msg.(*messages.Damage)
	if ok && damage.Target == p.from {
		damage.Target = p.to
	}
	return nil
}

func TestPreprocessorRunsBeforeCharacterAndFightProcessing(t *testing.T) {
	t.Parallel()

	originalTarget := guid.GUID(2)
	boss := creatureGUID(preprocessorTestBossEntry, 1)
	hostiles := make(map[uint32]Identity)
	LoadBosses(hostiles, map[uint32]string{preprocessorTestBossEntry: "Preprocessed Boss"})
	h := NewHookable(context.Background(), slog.Default(), unitdb.New(), zone.Zone{Name: "test"}, InstanceParams{
		Name:          "Test",
		Idf:           identifier.NewIdentifier(hostiles),
		Preprocessors: []instancehook.Preprocessor{targetPreprocessor{from: originalTarget, to: boss}},
	})

	player := guid.GUID(1)
	damage := &messages.Damage{
		MessageBase: messages.Base(time.Date(2026, time.August, 9, 12, 0, 0, 0, time.UTC)),
		Caster:      &player,
		Target:      originalTarget,
		Amount:      1,
	}
	require.NoError(t, h.Process(damage))

	require.Equal(t, boss, damage.Target)
	require.NotNil(t, h.currentFight)
	require.True(t, h.currentFight.active())
	_, active := h.currentFight.ActiveHostiles[boss]
	require.True(t, active)
	_, originalAdded := h.Characters.Get(originalTarget)
	require.False(t, originalAdded)
}
