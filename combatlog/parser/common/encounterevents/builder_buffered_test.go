package encounterevents_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBufferedBuilderDefersConversionUntilSerialization(t *testing.T) {
	t.Parallel()
	builder := encounterevents.NewBufferedBuilder[*messages.Damage, *chronicleproto.Damage]()
	first := &messages.Damage{MessageBase: messages.Base(time.Now()), Amount: 100}
	second := &messages.Damage{MessageBase: messages.Base(time.Now()), Amount: 200}
	var converted []int64
	convert := func(_ time.Time, _ int32, msg *messages.Damage) *chronicleproto.Damage {
		converted = append(converted, msg.Unranked)
		return &chronicleproto.Damage{Unranked: msg.Unranked}
	}
	require.NoError(t, encounterevents.AddToBuilder(builder, first, 0, convert))
	require.NoError(t, encounterevents.AddToBuilder(builder, second, 1, convert))
	require.Empty(t, converted)
	_, err := builder.Finalize(uuid.New())
	require.ErrorContains(t, err, "must be serialized")
	require.NoError(t, builder.SerializeBuffered(func(msg *messages.Damage) {
		msg.Unranked = int64(msg.Amount)
	}))
	require.Equal(t, []int64{100, 200}, converted)
	_, err = builder.Finalize(uuid.New())
	require.NoError(t, err)
	require.Error(t, builder.SerializeBuffered(nil))
}
