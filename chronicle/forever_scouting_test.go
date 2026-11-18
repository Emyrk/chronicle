package chronicle

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestScoutingPayloadIndependentFreshness(t *testing.T) {
	t.Parallel()
	players := map[guid.GUID][]scouting.Player{1: {
		{Name: "Nearby", LastSeen: 30, Observations: []scouting.Observation{
			{At: 10, Name: "Nearby", Level: ptr.Ref(20), Guild: ptr.Ref("Old")},
			{At: 20, Name: "Nearby", Guild: ptr.Ref("")},
		}},
		{Name: "Nearby", LastSeen: 25, Observations: []scouting.Observation{
			{At: 15, Name: "Nearby", Level: ptr.Ref(21), Guild: ptr.Ref("Stale")},
		}},
	}}
	payload, err := scoutingPayload(players, uuid.New())
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 1)
	row := rows[0]
	require.Equal(t, 21, *row.Level)
	require.Equal(t, int64(15), row.LevelObservedAt.Unix())
	require.Equal(t, "", *row.GuildName)
	require.True(t, row.GuildKnown)
	require.Equal(t, int64(20), row.GuildObservedAt.Unix())
	require.Equal(t, int64(30), row.ScoutingLastSeenAt.Unix())
	require.Nil(t, row.Race)
	require.Nil(t, row.Gender)
}

func TestScoutingPayloadThousandPlayers(t *testing.T) {
	t.Parallel()
	players := make(map[guid.GUID][]scouting.Player, 1000)
	for i := 1; i <= 1000; i++ {
		players[guid.GUID(i)] = []scouting.Player{{Name: fmt.Sprintf("Nearby%d", i), LastSeen: 20, Observations: []scouting.Observation{{At: 10, Name: fmt.Sprintf("Nearby%d", i)}}}}
	}
	payload, err := scoutingPayload(players, uuid.New())
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 1000)
	require.Equal(t, guid.GUID(1).String(), rows[0].ID)
	require.Equal(t, guid.GUID(1000).String(), rows[999].ID)
}

type scoutingTestSource struct{ messages []messages.Message }

func (s scoutingTestSource) Advance(context.Context) ([]messages.Message, error) {
	return s.messages, io.EOF
}

func TestScoutingTimelineDoesNotBackfillFutureEvidence(t *testing.T) {
	t.Parallel()
	before := &messages.Unit{MessageBase: messages.Base(time.Unix(5, 0)), Info: unitinfo.Info{Guid: 1, Owner: ptr.Ref(guid.GUID(2))}}
	after := &messages.Unit{MessageBase: messages.Base(time.Unix(15, 0)), Info: unitinfo.Info{Guid: 1, CanCooperate: true}}
	known := &messages.Unit{MessageBase: messages.Base(time.Unix(25, 0)), Info: unitinfo.Info{Guid: 1, Name: "Combat", Level: 60}}
	source := scoutingAdvancer{source: scoutingTestSource{messages: []messages.Message{before, after, known}}, players: map[guid.GUID][]scouting.Player{1: {{Name: "Scout", LastSeen: 30, Observations: []scouting.Observation{
		{At: 10, Name: "Scout", Level: ptr.Ref(20), Guild: ptr.Ref("Ignored")},
		{At: 20, Name: "Later", Level: ptr.Ref(21)},
	}}}}}
	batch, err := source.Advance(t.Context())
	require.ErrorIs(t, err, io.EOF)
	require.Empty(t, batch[0].(*messages.Unit).Name)
	require.Equal(t, *before.Owner, *batch[0].(*messages.Unit).Owner)
	middle := batch[1].(*messages.Unit)
	require.Equal(t, "Scout", middle.Name)
	require.Equal(t, int32(20), middle.Level)
	require.Equal(t, int64(10), middle.LevelObservedAt.Unix())
	require.True(t, middle.CanCooperate)
	require.Equal(t, "Combat", batch[2].(*messages.Unit).Name)
	require.Equal(t, int32(60), batch[2].(*messages.Unit).Level)
	require.Empty(t, after.Name, "must not mutate parser-owned message")
}

func TestScoutingArtifactLoaderPreservesOriginalsAndSkipsUnsupported(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	fixture, err := os.ReadFile("../combatlog/parser/forever/events/testdata/sidekick-events-v1.json")
	require.NoError(t, err)
	for key, data := range map[string][]byte{"valid.json": fixture, "future.json": []byte(`{"schema_version":99}`)} {
		_, err = objects.UploadFile(ctx, BucketRaidLogs, key, bytes.NewReader(data))
		require.NoError(t, err)
	}
	worker := WorkerLogParse{parent: &Chronicle{Storage: objects, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	players, err := worker.loadForeverScouting(ctx, []database.LogGroupArtifact{
		{Kind: ArtifactKindForeverEvents, ObjectKey: "valid.json"},
		{Kind: ArtifactKindForeverEvents, ObjectKey: "future.json"},
		{Kind: ArtifactKindForeverEvents, ObjectKey: "missing.json"},
		{Kind: "other", ObjectKey: "ignored"},
	})
	require.NoError(t, err)
	require.Len(t, players, 2)
	retained, err := objects.DownloadFile(ctx, BucketRaidLogs, "valid.json")
	require.NoError(t, err)
	require.Equal(t, fixture, retained)
	retained, err = objects.DownloadFile(ctx, BucketRaidLogs, "future.json")
	require.NoError(t, err)
	require.JSONEq(t, `{"schema_version":99}`, string(retained))
}
