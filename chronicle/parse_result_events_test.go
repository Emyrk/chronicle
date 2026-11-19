package chronicle

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"google.golang.org/protobuf/proto"
)

// This compares only log_instance_events. The paired instances have equivalent
// parent rows in one isolated test database; no other parse tables are written.
func TestParsedEventRowsMatchLegacyAfterJSONRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	reg := registry.RegistryForFlavor(logger, database.WoWFlavor{})
	gameDB := parityGameDB{}
	log := []byte("1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309\n" +
		"1771564197000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564200000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0")
	worker := &WorkerLogParse{parent: &Chronicle{logger: logger}}
	parsed, err := worker.parseCombatLog(ctx, database.LogFormat112aCcAddon,
		[]database.LogFile{{}}, nil, gameDB, reg, false, log, "")
	if err != nil {
		t.Fatal(err)
	}
	legacyInst := parsed.encountersState.Instances[0]
	legacyFinal, err := legacyInst.Finalize(ctx)
	if err != nil || legacyFinal == nil || len(legacyFinal.Encounters) != 1 {
		t.Fatalf("legacy finalize: result=%v err=%v", legacyFinal, err)
	}
	fresh, err := parseresult.Parse(ctx, bytes.NewReader(log), gameDB, reg, logger)
	if err != nil || len(fresh) != 1 || len(fresh[0].Encounters) != 1 {
		t.Fatalf("data-only parse: instances=%d err=%v", len(fresh), err)
	}
	payload, err := json.Marshal(fresh[0])
	if err != nil {
		t.Fatal(err)
	}
	var decoded parseresult.Result
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	if diff := cmp.Diff(fresh[0], decoded); diff != "" {
		t.Fatalf("result changed after JSON roundtrip (-before +after):\n%s", diff)
	}

	owner := uuid.New()
	server := uuid.New()
	realm := uuid.New()
	group := uuid.New()
	started := database.Timestamptz(time.Now())
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "event-parity-" + owner.String()})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "event-parity-" + server.String()})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "Test Realm"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: group, Owner: owner, LogType: database.LogTypeV2, CreatedAt: started, UpdatedAt: started,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.InsertParsedLogGroup(ctx, group); err != nil {
		t.Fatal(err)
	}
	ids := [2]uuid.UUID{uuid.New(), uuid.New()}
	for _, id := range ids {
		_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: id, RealmID: realm, LogGroupID: group, Name: "Zul'Gurub",
			StartTime: started, EndTime: database.Timestamptz(started.Time.Add(time.Minute)),
			Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := legacyInst.Events().Insert(ctx, store, ids[0]); err != nil {
		t.Fatalf("legacy event insert: %v", err)
	}
	if err := InsertParsedEventStreams(ctx, store, ids[1], decoded.Events); err != nil {
		t.Fatalf("decoded event insert: %v", err)
	}
	if diff := cmp.Diff(fresh[0].Events, decoded.Events); diff != "" {
		t.Fatalf("adapter mutated input streams: %s", diff)
	}
	for _, eventType := range database.AllLogInstanceEventTypeValues() {
		left, err := store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: ids[0], Type: string(eventType)})
		if err != nil {
			t.Fatalf("legacy %s row: %v", eventType, err)
		}
		right, err := store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: ids[1], Type: string(eventType)})
		if err != nil {
			t.Fatalf("decoded %s row: %v", eventType, err)
		}
		legacyBytes := unzipEventRow(t, left.Events)
		decodedBytes := unzipEventRow(t, right.Events)
		oldHeader := []byte("$" + legacyFinal.Encounters[0].Combat.EncounterID.String())
		newHeader := []byte("$" + decoded.Encounters[0].ID)
		if !bytes.Contains(legacyBytes, oldHeader) || !bytes.Contains(decodedBytes, newHeader) {
			t.Fatalf("%s: missing expected encounter header", eventType)
		}
		legacyBytes = bytes.Replace(legacyBytes, oldHeader, []byte("$"+uuid.Nil.String()), 1)
		decodedBytes = bytes.Replace(decodedBytes, newHeader, []byte("$"+uuid.Nil.String()), 1)
		if eventType == database.LogInstanceEventTypeUnitClassification {
			oldEvents, err := classificationEvents(legacyBytes)
			if err != nil {
				t.Fatal(err)
			}
			newEvents, err := classificationEvents(decodedBytes)
			if err != nil {
				t.Fatal(err)
			}
			if diff := cmp.Diff(oldEvents, newEvents, cmp.Comparer(proto.Equal)); diff != "" {
				t.Fatalf("%s decoded records (-legacy +new):\n%s", eventType, diff)
			}
			continue
		}
		if diff := cmp.Diff(legacyBytes, decodedBytes); diff != "" {
			t.Fatalf("%s decompressed row (-legacy +new):\n%s", eventType, diff)
		}
	}
}

func unzipEventRow(t *testing.T, data []byte) []byte {
	t.Helper()
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	plain, readErr := io.ReadAll(reader)
	closeErr := reader.Close()
	if readErr != nil {
		t.Fatal(fmt.Errorf("read gzip event row: %w", readErr))
	}
	if closeErr != nil {
		t.Fatal(fmt.Errorf("close gzip event row: %w", closeErr))
	}
	return plain
}
