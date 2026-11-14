package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"testing"
	"time"

	pb "github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

func gzipBytes(t *testing.T, data []byte) []byte {
	t.Helper()
	var out bytes.Buffer
	writer := gzip.NewWriter(&out)
	_, err := writer.Write(data)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	return out.Bytes()
}
func segmentBytes(t *testing.T, id uuid.UUID, first int64, events ...proto.Message) []byte {
	t.Helper()
	builder := encounterevents.NewBuilder[messages.Message, proto.Message]()
	builder.SetZero(time.UnixMilli(first))
	for i, event := range events {
		require.NoError(t, encounterevents.AddToBuilder(builder, messages.Message(nil), int32(i), func(time.Time, int32, messages.Message) proto.Message { return event }))
	}
	data, err := builder.Finalize(id)
	require.NoError(t, err)
	return data
}
func jsonBytes(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	require.NoError(t, err)
	return data
}

func TestCanonicalIDs(t *testing.T) {
	t.Parallel()
	start := database.Timestamptz(time.Date(2025, 1, 2, 3, 4, 5, 123456000, time.UTC))
	a := database.LogInstancesGuild{ID: uuid.New(), RealmID: dbstatic.RealmNordanaar(), Name: "raid", StartTime: start, EndTime: start}
	b := a
	b.ID = uuid.New()
	b.Name = "other"
	keys, err := instanceKeys([]database.LogInstancesGuild{a, b})
	require.NoError(t, err)
	cloneA, cloneB := a, b
	cloneA.ID = uuid.New()
	cloneB.ID = uuid.New()
	cloneKeys, err := instanceKeys([]database.LogInstancesGuild{cloneB, cloneA})
	require.NoError(t, err)
	require.Equal(t, keys[a.ID], cloneKeys[cloneA.ID])
	require.Equal(t, keys[b.ID], cloneKeys[cloneB.ID])
	require.Equal(t, jsonBytes(t, instanceValues(a, keys[a.ID])), jsonBytes(t, instanceValues(cloneA, cloneKeys[cloneA.ID])))
	_, err = instanceKeys([]database.LogInstancesGuild{a, cloneA})
	require.ErrorContains(t, err, "ambiguous")
	cloneA.StartTime.Time = cloneA.StartTime.Time.In(time.FixedZone("offset", -3*60*60))
	require.Equal(t, jsonBytes(t, instanceValues(a, "same")), jsonBytes(t, instanceValues(cloneA, "same")))
	cloneA.EndTime.Time = cloneA.EndTime.Time.Add(time.Microsecond)
	require.NotEqual(t, jsonBytes(t, instanceValues(a, "same")), jsonBytes(t, instanceValues(cloneA, "same")))
	encounter := database.LogInstanceEncounter{ID: uuid.New(), Name: "boss", StartTime: start, EndTime: start, RankingStartOffsetMs: pgtype.Int8{Int64: 123, Valid: true}}
	encounterIDs, err := encounterKeys([]database.LogInstanceEncounter{encounter}, "instance/0")
	require.NoError(t, err)
	clonedEncounter := encounter
	clonedEncounter.ID = uuid.New()
	clonedIDs, err := encounterKeys([]database.LogInstanceEncounter{clonedEncounter}, "instance/0")
	require.NoError(t, err)
	require.Equal(t, encounterIDs[encounter.ID], clonedIDs[clonedEncounter.ID])
	require.Equal(t, jsonBytes(t, encounterValues(encounter, encounterIDs[encounter.ID], "instance/0")), jsonBytes(t, encounterValues(clonedEncounter, clonedIDs[clonedEncounter.ID], "instance/0")))
	_, err = encounterKeys([]database.LogInstanceEncounter{encounter, clonedEncounter}, "instance/0")
	require.ErrorContains(t, err, "ambiguous")
	changed := encounter
	changed.RankingStartOffsetMs.Int64++
	require.NotEqual(t, jsonBytes(t, encounterValues(encounter, "e", "i")), jsonBytes(t, encounterValues(changed, "e", "i")))
}

func TestDecodeEvents(t *testing.T) {
	t.Parallel()
	id, cloneID := uuid.New(), uuid.New()
	event := &pb.AuraCast{Meta: &pb.EventMeta{Index: 17, OffsetMilli: 27}, DurationMS: 123456}
	first := int64(1735787045123)
	decoded, err := decodeEvents(gzipBytes(t, segmentBytes(t, id, first, event)), "aura_cast", map[uuid.UUID]string{id: "encounter/0"})
	require.NoError(t, err)
	clone, err := decodeEvents(gzipBytes(t, segmentBytes(t, cloneID, first, event)), "aura_cast", map[uuid.UUID]string{cloneID: "encounter/0"})
	require.NoError(t, err)
	require.Equal(t, jsonBytes(t, decoded), jsonBytes(t, clone))
	require.Equal(t, first, decoded[0].FirstTimestampMilli)
	require.Contains(t, string(decoded[0].Events[0]), `"durationMS":123456`)
	require.Contains(t, string(decoded[0].Events[0]), `"offsetMilli":"27"`)
	event.DurationMS++
	changed, err := decodeEvents(gzipBytes(t, segmentBytes(t, id, first, event)), "aura_cast", map[uuid.UUID]string{id: "encounter/0"})
	require.NoError(t, err)
	require.NotEqual(t, jsonBytes(t, decoded), jsonBytes(t, changed))
	event.DurationMS--
	event.Meta.OffsetMilli++
	changed, err = decodeEvents(gzipBytes(t, segmentBytes(t, id, first, event)), "aura_cast", map[uuid.UUID]string{id: "encounter/0"})
	require.NoError(t, err)
	require.NotEqual(t, jsonBytes(t, decoded), jsonBytes(t, changed))
	resources := &pb.UnitResources{CurrentHealth: 9007199254740993}
	exact, err := decodeEvents(gzipBytes(t, segmentBytes(t, id, first, resources)), "unit_resources", map[uuid.UUID]string{id: "encounter/0"})
	require.NoError(t, err)
	require.Contains(t, string(exact[0].Events[0]), `"current_health":"9007199254740993"`)
	// Segment order is storage order, but event order and timestamps are semantic.
	secondID := uuid.New()
	segmentA := segmentBytes(t, id, first, event)
	segmentB := segmentBytes(t, secondID, first+1, event)
	keys := map[uuid.UUID]string{id: "e/0", secondID: "e/1"}
	forward, err := decodeEvents(gzipBytes(t, append(append([]byte{}, segmentA...), segmentB...)), "aura_cast", keys)
	require.NoError(t, err)
	reverse, err := decodeEvents(gzipBytes(t, append(append([]byte{}, segmentB...), segmentA...)), "aura_cast", keys)
	require.NoError(t, err)
	require.Equal(t, jsonBytes(t, forward), jsonBytes(t, reverse))
	require.Len(t, eventMessages, len(database.AllLogInstanceEventTypeValues()))
	for _, kind := range database.AllLogInstanceEventTypeValues() {
		_, err := decodeEvents(gzipBytes(t, segmentBytes(t, id, first, eventMessages[kind])), kind, map[uuid.UUID]string{id: "encounter/0"})
		require.NoError(t, err)
	}
}

func TestDecodeEventsRejectsMalformed(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	valid := segmentBytes(t, id, 1, &pb.Damage{})
	unknown := &pb.Damage{Meta: &pb.EventMeta{}}
	unknown.Meta.ProtoReflect().SetUnknown(protowire.AppendVarint(protowire.AppendTag(nil, 999, protowire.VarintType), 1))
	for name, data := range map[string][]byte{
		"truncated header": {0xff}, "truncated body": valid[:len(valid)-1],
		"unknown encounter":      segmentBytes(t, uuid.New(), 1),
		"repeated encounter":     append(append([]byte{}, valid...), valid...),
		"count mismatch":         append(protowire.AppendVarint(protowire.AppendVarint(protowire.AppendString(nil, id.String()), 1), 2), 0),
		"unknown protobuf field": segmentBytes(t, id, 1, unknown),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := decodeEvents(gzipBytes(t, data), "damage", map[uuid.UUID]string{id: "e"})
			require.Error(t, err)
		})
	}
	_, err := decodeEvents([]byte("invalid gzip"), "damage", nil)
	require.Error(t, err)
	_, err = decodeEvents(gzipBytes(t, nil), "future_stream", nil)
	require.Error(t, err)
}

func seedGroup(t *testing.T, ctx context.Context, db database.Store) uuid.UUID {
	t.Helper()
	owner, group := uuid.New(), uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: owner.String(), Email: owner.String() + "@example.com"})
	require.NoError(t, err)
	now := database.Timestamptz(time.Date(2025, 1, 2, 3, 4, 5, 123456000, time.UTC))
	_, err = db.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeAzerothcore, CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	return group
}

func TestExportPublicationAndScope(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	group := seedGroup(t, ctx, db)
	require.ErrorContains(t, parse(ctx, db, nil, chronicle.ArgsLogParse{LogID: group, ParseGeneration: 2}, "", chronicle.BaselineLegacy, ""), "does not match")
	_, err := export(ctx, db, group, 1, 1)
	require.ErrorContains(t, err, "missing publication")
	require.NoError(t, db.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: group, ParseGeneration: 1}))
	require.ErrorContains(t, parse(ctx, db, nil, chronicle.ArgsLogParse{LogID: group, ParseGeneration: 1}, "", chronicle.BaselineLegacy, ""), "fresh seed")
	_, err = export(ctx, db, group, 1, 1)
	require.ErrorContains(t, err, "missing publication")
	_, err = db.FinalizeParsedLogGroup(ctx, database.FinalizeParsedLogGroupParams{ID: group, ParseGeneration: 1})
	require.NoError(t, err)
	_, err = export(ctx, db, group, 2, 1)
	require.ErrorContains(t, err, "missing publication")
	_, err = export(ctx, db, group, 1, 1)
	require.ErrorContains(t, err, "found 0")
	now := database.Timestamptz(time.Date(2025, 1, 2, 3, 4, 5, 123456000, time.UTC))
	instanceID := uuid.New()
	_, err = db.InsertInstance(ctx, database.InsertInstanceParams{ID: instanceID, RealmID: dbstatic.RealmNordanaar(), LogGroupID: group, Name: "raid", StartTime: now, EndTime: now, Capabilities: []string{}, Versions: database.VersionsMap{}})
	require.NoError(t, err)
	_, err = export(ctx, db, group, 1, 1)
	require.ErrorContains(t, err, "no encounters")
	encounterID := uuid.New()
	_, err = db.InsertEncounter(ctx, database.InsertEncounterParams{ID: encounterID, InstanceID: instanceID, Name: "boss", StartTime: now, EndTime: now, KillType: database.KillTypeClean, Remaining: guid.GUIDs{}})
	require.NoError(t, err)
	_, err = export(ctx, db, group, 1, 1)
	require.ErrorContains(t, err, "missing stream")
	events := make([]database.InsertLogInstanceEventsParams, 0)
	for _, kind := range database.AllLogInstanceEventTypeValues() {
		events = append(events, database.InsertLogInstanceEventsParams{InstanceID: instanceID, Type: kind, Events: gzipBytes(t, segmentBytes(t, encounterID, 0))})
	}
	require.NoError(t, db.InsertLogInstanceEvents(ctx, events).Close())
	_, err = export(ctx, db, group, 1, 1)
	require.ErrorContains(t, err, "missing mandatory overview")
	require.NoError(t, db.UpsertInstanceOverviewMetrics(ctx, database.UpsertInstanceOverviewMetricsParams{InstanceID: instanceID, TopIncomingDamageAbilities: []database.OverviewIncomingDamageAbility{}}))
	first, err := export(ctx, db, group, 1, 1)
	require.NoError(t, err)
	require.Len(t, first.Instances, 1)
	require.Len(t, first.Instances[0].Events, len(eventMessages))
	// Unrelated output must not enter this log group's artifact.
	unrelated := seedGroup(t, ctx, db)
	require.NoError(t, db.InsertParsedLogGroup(ctx, unrelated))
	_, err = db.InsertInstance(ctx, database.InsertInstanceParams{ID: uuid.New(), RealmID: dbstatic.RealmNordanaar(), LogGroupID: unrelated, Name: "unrelated", StartTime: now, EndTime: now, Capabilities: []string{}, Versions: database.VersionsMap{}})
	require.NoError(t, err)
	second, err := export(ctx, db, group, 1, 1)
	require.NoError(t, err)
	require.Equal(t, jsonBytes(t, first), jsonBytes(t, second))
	_, err = db.AdvanceWoWLogGroupParseGeneration(ctx, group)
	require.NoError(t, err)
	_, err = export(ctx, db, group, 1, 1)
	require.ErrorContains(t, err, "missing publication")
}
