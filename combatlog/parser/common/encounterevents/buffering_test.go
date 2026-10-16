package encounterevents_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestBufferedDamageSerializesFinalMutation(t *testing.T) {
	t.Parallel()

	at := time.Date(2026, time.October, 6, 12, 0, 0, 0, time.UTC)
	damage := &messages.Damage{
		MessageBase:         messages.Base(at),
		Target:              guid.GUID(2),
		Amount:              100,
		RankedDamagePending: true,
	}
	inProgress := encounterevents.New(false)
	require.NoError(t, inProgress.Process(damage))

	rankedDamage := int64(0)
	damage.RankedDamage = &rankedDamage

	serialized := encounterevents.NewEvents()
	require.NoError(t, inProgress.Finalize(serialized, uuid.New()))

	payload := serialized.Damage
	_, n := protowire.ConsumeString(payload)
	require.Positive(t, n)
	payload = payload[n:]
	_, n = protowire.ConsumeVarint(payload) // first timestamp
	require.Positive(t, n)
	payload = payload[n:]
	count, n := protowire.ConsumeVarint(payload)
	require.Positive(t, n)
	require.Equal(t, uint64(1), count)
	payload = payload[n:]
	_, n = protowire.ConsumeVarint(payload) // body length
	require.Positive(t, n)
	payload = payload[n:]

	messageLength, n := protowire.ConsumeVarint(payload)
	require.Positive(t, n)
	payload = payload[n:]
	require.GreaterOrEqual(t, len(payload), int(messageLength))

	var got chronicleproto.Damage
	require.NoError(t, proto.Unmarshal(payload[:messageLength], &got))
	require.NotNil(t, got.RankedDamage)
	require.Equal(t, int64(0), *got.RankedDamage)
}
