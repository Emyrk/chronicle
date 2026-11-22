package chronicle

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type participantCatalogStub struct {
	realm  database.WowServerRealm
	server database.WowServer
	realms []database.WowServerRealm
	lists  int
}

func (s *participantCatalogStub) GetWoWServerRealm(context.Context, uuid.UUID) (database.WowServerRealm, error) {
	return s.realm, nil
}
func (s *participantCatalogStub) GetWoWServer(context.Context, uuid.UUID) (database.WowServer, error) {
	return s.server, nil
}
func (s *participantCatalogStub) ListWoWServerRealms(context.Context, uuid.UUID) ([]database.WowServerRealm, error) {
	s.lists++
	return s.realms, nil
}

func TestParticipantRealmCatalogScope(t *testing.T) {
	t.Parallel()
	server, other, tenant := uuid.New(), uuid.New(), uuid.New()
	realm := database.WowServerRealm{ID: uuid.New(), ServerID: server, Name: "Normal-US"}
	foreign := database.WowServerRealm{ID: uuid.New(), ServerID: other, Name: "Normal-EU"}
	stub := &participantCatalogStub{realm: realm, server: database.WowServer{ID: server, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}, realms: []database.WowServerRealm{realm, foreign}}
	cache := make(participantRealmCatalogs)
	ctx := testutil.Context(t, testutil.WaitShort)
	catalog, err := cache.load(ctx, stub, realm.ID, tenant, database.LogFormatV22Cleu)
	require.NoError(t, err)
	require.Equal(t, realm.ID, catalog.resolve("Normal-US").UUID)
	require.False(t, catalog.resolve("Normal-EU").Valid)
	_, err = cache.load(ctx, stub, realm.ID, tenant, database.LogFormatV22Cleu)
	require.NoError(t, err)
	require.Equal(t, 1, stub.lists)
	for _, tc := range []struct {
		tenant uuid.UUID
		format database.LogFormat
	}{
		{uuid.New(), database.LogFormatV22Cleu}, {uuid.Nil, database.LogFormatV22Cleu}, {tenant, database.LogFormatV9Cleu}, {tenant, database.LogFormatHermesproxy1142Cc},
	} {
		missing, err := cache.load(ctx, stub, realm.ID, tc.tenant, tc.format)
		require.NoError(t, err)
		require.Nil(t, missing)
	}
	require.Equal(t, 1, stub.lists)
}

func TestParticipantRealmCatalogMatching(t *testing.T) {
	t.Parallel()
	server := uuid.New()
	base := database.WowServerRealm{ID: uuid.New(), ServerID: server, Name: "ClassicBetaPvE", Aliases: []string{"beta", "shared"}}
	numbered := database.WowServerRealm{ID: uuid.New(), ServerID: server, Name: "ClassicBetaPvE2", Aliases: []string{"shared"}}
	catalog := newParticipantRealmCatalog(server, []database.WowServerRealm{base, numbered})
	require.Equal(t, numbered.ID, catalog.resolve("ClassicBetaPvE2").UUID)
	require.Equal(t, base.ID, catalog.resolve("ClassicBetaPvE3").UUID)
	require.Equal(t, base.ID, catalog.resolve("BETA").UUID)
	for _, raw := range []string{"", "unknown", "shared", "CAMWOWUS1Realm1PvE"} {
		require.False(t, catalog.resolve(raw).Valid, raw)
	}
}

func TestParticipantRealmsPersistWithoutFallback(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	owner, instanceRealm := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	instanceCatalog, err := store.GetWoWServerRealm(ctx, instanceRealm)
	require.NoError(t, err)
	eu, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: instanceCatalog.ServerID, Name: "Normal-EU"})
	require.NoError(t, err)
	us, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: instanceCatalog.ServerID, Name: "Normal-US"})
	require.NoError(t, err)
	log := insertVisibilityTestLogGroup(t, ctx, store, owner)
	instance := insertVisibilityTestInstance(t, ctx, store, log, instanceRealm, "realm-test", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	units := unitdb.New(nil)
	builder := newInstanceBuilder(units, instance)
	builder.realmCatalog = newParticipantRealmCatalog(instanceCatalog.ServerID, []database.WowServerRealm{us, eu, instanceCatalog})
	for i, raw := range []string{"Normal-US", "Normal-EU", "", "not-cataloged"} {
		id := guid.GUID(i + 1)
		units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "selected", RawRealm: raw})
		units.Update(unitinfo.Info{Guid: id, Name: "different", RawRealm: instanceCatalog.Name})
		builder.participate(id)
	}
	require.NoError(t, builder.insert(ctx, store))
	rows, err := store.InstancePlayersByInstanceID(ctx, instance)
	require.NoError(t, err)
	require.Len(t, rows, 4)
	byID := make(map[guid.GUID]uuid.NullUUID)
	for _, row := range rows {
		byID[row.UnitGuid] = row.RealmID
	}
	require.Equal(t, uuid.NullUUID{UUID: us.ID, Valid: true}, byID[1])
	require.Equal(t, uuid.NullUUID{UUID: eu.ID, Valid: true}, byID[2])
	require.False(t, byID[3].Valid)
	require.False(t, byID[4].Valid)
	// No resolver (legacy formats) writes NULL even if raw metadata is present.
	legacy := newInstanceBuilder(units, instance)
	legacy.participate(1)
	require.False(t, legacy.participants[0].RealmID.Valid)
	require.NoError(t, legacy.insert(ctx, store))
	// NOT VALID still enforces new foreign-key references.
	bad := legacy.participants[0]
	bad.RealmID = uuid.NullUUID{UUID: uuid.New(), Valid: true}
	require.Error(t, store.InsertInstancePlayers(ctx, []database.InsertInstancePlayersParams{bad}).Close())
}
