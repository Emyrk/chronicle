package chronicle

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/authztest"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParsedArmoryPlayersMatchLegacyAfterJSONRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	owner, server, group := uuid.New(), uuid.New(), uuid.New()
	realms := [2]uuid.UUID{uuid.New(), uuid.New()}
	instanceIDs := [2]uuid.UUID{uuid.New(), uuid.New()}
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "armory-parity-" + owner.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "armory-parity-" + server.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2, CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, group))
	for i := range realms {
		_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realms[i], ServerID: server, Name: "Armory Realm " + realms[i].String()})
		require.NoError(t, err)
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{ID: instanceIDs[i], RealmID: realms[i], LogGroupID: group, Name: "Armory Raid", StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)), Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40})
		require.NoError(t, err)
	}
	units := unitdb.New()
	tracker := armory.New(units)
	id := guid.GUID(1)
	enchant, transmog := 20, 30
	talents := &combatant.Talents{TabNames: [3]string{"Arms", "Fury", "Protection"}, Summary: [3]uint8{3, 2}}
	talents.Trees[0], talents.Trees[1] = []uint8{1, 2}, []uint8{2}
	tracker.Guilds["Raiders"] = map[guid.GUID]struct{}{id: {}}
	tracker.Participant[id] = struct{}{}
	tracker.Players[id] = combatant.Combatant{Guid: id, Name: "Hero", Seen: at, Guild: &combatant.Guild{Name: "Raiders"},
		HeroClass: types.HeroClassesWARRIOR, Race: types.HeroRacesHuman, Gender: types.HeroGenderFemale,
		Level: ptrLevel(60), Talents: talents,
		GearSetups: []combatant.GearItem{{ItemID: 123456789, Name: "Missing item", EnchantID: &enchant, TransmogID: &transmog, GemEnchantIDs: [4]int{2, 0, 3}}}}
	grpcURL, key := authztest.NewSpiceDBWithAddress(t)
	zed, err := authz.New(ctx, authz.Options{GRPCURL: grpcURL, PreSharedKey: key, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), DB: store})
	require.NoError(t, err)
	require.NoError(t, zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		_, err := tracker.Insert(ctx, units, instanceIDs[0], realms[0], uuid.Nil, tx)
		return err
	}, nil))
	result, err := parseresult.Build(parseresult.Input{Format: database.LogFormat112aCcAddon,
		Finalized: &instances.FinalizedInstance{Guilds: tracker}, Events: encounterevents.NewEvents(), Units: units, Armory: tracker})
	require.NoError(t, err)
	data, err := json.Marshal(result.Armory)
	require.NoError(t, err)
	var decoded parseresult.ArmoryObservation
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.NoError(t, zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		_, err := InsertParsedArmory(ctx, tx, decoded, ParsedArmoryWrite{RealmID: realms[1], RealmName: "Armory Realm", InstanceID: instanceIDs[1], InstanceStart: at})
		return err
	}, nil))
	direct, err := store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realms[0], Identifier: id})
	require.NoError(t, err)
	parsed, err := store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realms[1], Identifier: id})
	require.NoError(t, err)
	direct.RealmID, parsed.RealmID = uuid.Nil, uuid.Nil
	direct.GuildID, parsed.GuildID = uuid.NullUUID{}, uuid.NullUUID{}
	direct.CreatedAt, parsed.CreatedAt = database.Timestamptz(time.Time{}), database.Timestamptz(time.Time{})
	direct.UpdatedFromInstance, parsed.UpdatedFromInstance = uuid.NullUUID{}, uuid.NullUUID{}
	direct.RealmName, parsed.RealmName = "", ""
	if diff := cmp.Diff(direct, parsed); diff != "" {
		t.Fatalf("player row (-legacy +adapter):\n%s", diff)
	}
	historyA, err := store.GetPlayerGearHistory(ctx, database.GetPlayerGearHistoryParams{RealmID: realms[0], PlayerID: id, ResultLimit: 10})
	require.NoError(t, err)
	historyB, err := store.GetPlayerGearHistory(ctx, database.GetPlayerGearHistoryParams{RealmID: realms[1], PlayerID: id, ResultLimit: 10})
	require.NoError(t, err)
	require.Len(t, historyA, 1)
	require.Len(t, historyB, 1)
	historyA[0].InstanceID, historyB[0].InstanceID = uuid.Nil, uuid.Nil
	if diff := cmp.Diff(historyA, historyB); diff != "" {
		t.Fatalf("gear history (-legacy +adapter):\n%s", diff)
	}
}

// The metadata lookup must happen on the primary and override the raw item ID.
// In particular, a name hit supports transmog IDs absent from the dataset.
type metadataArmoryStore struct {
	database.Store
	calls int
}

func (s *metadataArmoryStore) GetItemTemplateMetadataBatch(_ context.Context, arg database.GetItemTemplateMetadataBatchParams) ([]database.GetItemTemplateMetadataBatchRow, error) {
	s.calls++
	if len(arg.ItemIds) != 1 || arg.ItemIds[0] != 987 || len(arg.ItemNames) != 1 || arg.ItemNames[0] != "Named sword" {
		return nil, fmt.Errorf("unexpected item metadata lookup: %+v", arg)
	}
	return []database.GetItemTemplateMetadataBatchRow{{Entry: 123, Name: "Named sword", Quality: 4, Icon: "sword", ItemLevel: 65}}, nil
}

func TestParsedArmoryResolvesMetadataAndUnlistedProvenance(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	store, _ := dbtestutil.NewDB(t)
	server, realm := uuid.New(), uuid.New()
	_, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: server, Name: "armory-metadata-" + server.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server, Name: "Metadata Realm"})
	require.NoError(t, err)
	id := guid.GUID(5)
	observed := parseresult.ArmoryObservation{Players: []parseresult.ObservedPlayer{{GUID: id.String(), Name: "Metadata Hero",
		Class: string(database.WowPlayableClassWARRIOR), Gender: string(database.WowPlayableGenderFemale), Race: string(database.WowPlayableRaceHuman), Seen: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
		Gear: []parseresult.ObservedGear{{ItemID: 987, Name: "Named sword"}}}}}
	wrapped := &metadataArmoryStore{Store: store}
	_, err = InsertParsedArmory(ctx, wrapped, observed, ParsedArmoryWrite{RealmID: realm, InstanceID: uuid.New(), Unlisted: true})
	require.NoError(t, err)
	require.Equal(t, 1, wrapped.calls)
	player, err := store.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: realm, Identifier: id})
	require.NoError(t, err)
	require.False(t, player.UpdatedFromInstance.Valid)
	require.NotNil(t, player.Gear)
	require.Equal(t, database.PlayerGear{ItemID: 123, ItemName: "Named sword", ItemQuality: 4, ItemIcon: "sword", ItemLevel: ptrInt32(65)}, player.Gear[0])
	history, err := store.GetPlayerGearHistory(ctx, database.GetPlayerGearHistoryParams{RealmID: realm, PlayerID: id, ResultLimit: 10})
	require.NoError(t, err)
	require.Empty(t, history)

	owner, group, instanceID := uuid.New(), uuid.New(), uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "armory-history-" + owner.String()})
	require.NoError(t, err)
	at := observed.Players[0].Seen
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: group, Owner: owner, LogType: database.LogTypeV2, CreatedAt: database.Timestamptz(at), UpdatedAt: database.Timestamptz(at)})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, group))
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{ID: instanceID, RealmID: realm, LogGroupID: group, Name: "Metadata Raid", StartTime: database.Timestamptz(at), EndTime: database.Timestamptz(at.Add(time.Minute)), Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40})
	require.NoError(t, err)
	observed.Players[0].GUID = guid.GUID(6).String()
	_, err = InsertParsedArmory(ctx, wrapped, observed, ParsedArmoryWrite{RealmID: realm, InstanceID: instanceID})
	require.NoError(t, err)
	history, err = store.GetPlayerGearHistory(ctx, database.GetPlayerGearHistoryParams{RealmID: realm, PlayerID: guid.GUID(6), ResultLimit: 10})
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, instanceID, history[0].InstanceID)
	require.Equal(t, float32(65), history[0].AvgIlvl.Float32)
	require.True(t, history[0].AvgIlvl.Valid)
}

func ptrInt32(v int32) *int32 { return &v }

func ptrLevel(v int32) *int32 { return &v }
