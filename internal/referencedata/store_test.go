package referencedata

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestObservePlayerCompactsIdenticalDailySnapshots(t *testing.T) {
	t.Parallel()
	configureTenantHooks()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t, dbtestutil.WithTimezone("UTC"))
	tenantID, realmID := createReferenceRealm(t, ctx, db)
	tenantCtx := servicetenant.WithTenantID(ctx, tenantID)
	store := NewStore(db)

	morning := time.Date(2026, time.October, 5, 9, 0, 0, 0, time.UTC)
	evening := morning.Add(9 * time.Hour)
	payload := PlayerSnapshot{
		Gear:    map[string]any{"head": 123, "chest": 456},
		Talents: map[string]any{"tree": []any{1, 2, 3}},
	}

	first, err := store.ObservePlayer(tenantCtx, tenantID, realmID, " Alice ", morning, payload)
	require.NoError(t, err)
	second, err := store.ObservePlayer(tenantCtx, tenantID, realmID, "ALICE", evening, PlayerSnapshot{
		Gear:    map[string]any{"chest": 456, "head": 123},
		Talents: map[string]any{"tree": []any{1, 2, 3}},
	})
	require.NoError(t, err)

	require.Equal(t, first.Entity.ID, second.Entity.ID)
	require.Equal(t, first.Content.ID, second.Content.ID)
	require.Equal(t, first.Snapshot.ID, second.Snapshot.ID)
	require.True(t, morning.Equal(second.Snapshot.ObservedAt.Time))
	require.True(t, evening.Equal(second.Snapshot.LastObservedAt.Time))
	require.Equal(t, "ALICE", second.Entity.Name)

	nextDay, err := store.ObservePlayer(tenantCtx, tenantID, realmID, "alice", morning.Add(24*time.Hour), payload)
	require.NoError(t, err)
	require.Equal(t, first.Content.ID, nextDay.Content.ID)
	require.NotEqual(t, first.Snapshot.ID, nextDay.Snapshot.ID)

	older, err := store.ObservePlayer(tenantCtx, tenantID, realmID, "ALICE", morning.Add(-24*time.Hour), PlayerSnapshot{Gear: map[string]any{"head": 999}})
	require.NoError(t, err)
	require.Equal(t, nextDay.Snapshot.ID, older.Entity.CurrentSnapshotID.UUID)
	require.Equal(t, "alice", older.Entity.Name)

	current, err := store.Current(tenantCtx, first.Entity.ID)
	require.NoError(t, err)
	require.Equal(t, nextDay.Snapshot.ID, current.ExternalReferenceSnapshot.ID)

	history, err := store.History(tenantCtx, first.Entity.ID)
	require.NoError(t, err)
	require.Len(t, history, 3)
}

func TestObservePlayerPreservesSameDayContentTransitions(t *testing.T) {
	t.Parallel()
	configureTenantHooks()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t, dbtestutil.WithTimezone("UTC"))
	tenantID, realmID := createReferenceRealm(t, ctx, db)
	tenantCtx := servicetenant.WithTenantID(ctx, tenantID)
	store := NewStore(db)
	morning := time.Date(2026, time.October, 5, 9, 0, 0, 0, time.UTC)

	firstA, err := store.ObservePlayer(tenantCtx, tenantID, realmID, "Alice", morning, PlayerSnapshot{Gear: map[string]any{"head": 1}})
	require.NoError(t, err)
	contentB, err := store.ObservePlayer(tenantCtx, tenantID, realmID, "Alice", morning.Add(3*time.Hour), PlayerSnapshot{Gear: map[string]any{"head": 2}})
	require.NoError(t, err)
	secondA, err := store.ObservePlayer(tenantCtx, tenantID, realmID, "Alice", morning.Add(9*time.Hour), PlayerSnapshot{Gear: map[string]any{"head": 1}})
	require.NoError(t, err)

	require.Equal(t, firstA.Content.ID, secondA.Content.ID)
	require.NotEqual(t, firstA.Snapshot.ID, secondA.Snapshot.ID)
	require.EqualValues(t, 1, firstA.Snapshot.Sequence)
	require.EqualValues(t, 2, contentB.Snapshot.Sequence)
	require.EqualValues(t, 3, secondA.Snapshot.Sequence)

	_, err = store.ObservePlayer(tenantCtx, tenantID, realmID, "Alice", morning.Add(6*time.Hour), PlayerSnapshot{Gear: map[string]any{"head": 3}})
	require.ErrorIs(t, err, ErrOutOfOrder)

	atAfternoon, err := store.At(tenantCtx, tenantID, realmID, KindPlayer, "alice", morning.Add(4*time.Hour))
	require.NoError(t, err)
	require.Equal(t, contentB.Content.ID, atAfternoon.ExternalReferenceContent.ID)
	atEvening, err := store.At(tenantCtx, tenantID, realmID, KindPlayer, "alice", morning.Add(10*time.Hour))
	require.NoError(t, err)
	require.Equal(t, secondA.Content.ID, atEvening.ExternalReferenceContent.ID)
}

func TestObserveGuildCanonicalizesCompleteRoster(t *testing.T) {
	t.Parallel()
	configureTenantHooks()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t, dbtestutil.WithTimezone("UTC"))
	tenantID, realmID := createReferenceRealm(t, ctx, db)
	tenantCtx := servicetenant.WithTenantID(ctx, tenantID)
	store := NewStore(db)
	observedAt := time.Date(2026, time.October, 5, 9, 0, 0, 0, time.UTC)

	first, err := store.ObserveGuild(tenantCtx, tenantID, realmID, "Raiders", observedAt, GuildSnapshot{Members: []GuildMember{
		{Name: "Zulu", Rank: "Member"},
		{Name: " Alpha ", Rank: "Officer"},
	}})
	require.NoError(t, err)
	second, err := store.ObserveGuild(tenantCtx, tenantID, realmID, "raiders", observedAt.Add(time.Hour), GuildSnapshot{Members: []GuildMember{
		{Name: "Alpha", Rank: "Officer"},
		{Name: "Zulu", Rank: "Member"},
	}})
	require.NoError(t, err)
	require.Equal(t, first.Content.ID, second.Content.ID)
	require.Equal(t, first.Snapshot.ID, second.Snapshot.ID)

	changed, err := store.ObserveGuild(tenantCtx, tenantID, realmID, "Raiders", observedAt.Add(2*time.Hour), GuildSnapshot{Members: []GuildMember{
		{Name: "Alpha", Rank: "Officer"},
	}})
	require.NoError(t, err)
	require.NotEqual(t, first.Content.ID, changed.Content.ID)
	require.NotEqual(t, first.Snapshot.ID, changed.Snapshot.ID)

	current, err := store.Current(tenantCtx, first.Entity.ID)
	require.NoError(t, err)
	require.Equal(t, changed.Snapshot.ID, current.ExternalReferenceSnapshot.ID)
}

func TestReferenceDataTenantIsolationAndHistoricalLookup(t *testing.T) {
	t.Parallel()
	configureTenantHooks()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t, dbtestutil.WithTimezone("UTC"))
	firstTenantID, firstRealmID := createReferenceRealm(t, ctx, db)
	secondTenantID, secondRealmID := createReferenceRealm(t, ctx, db)
	store := NewStore(db)
	morning := time.Date(2026, time.October, 5, 9, 0, 0, 0, time.UTC)

	firstTenantCtx := servicetenant.WithTenantID(ctx, firstTenantID)
	first, err := store.ObservePlayer(firstTenantCtx, firstTenantID, firstRealmID, "Alice", morning, PlayerSnapshot{Gear: map[string]any{"head": 1}})
	require.NoError(t, err)
	changed, err := store.ObservePlayer(firstTenantCtx, firstTenantID, firstRealmID, "Alice", morning.Add(3*time.Hour), PlayerSnapshot{Gear: map[string]any{"head": 2}})
	require.NoError(t, err)

	atTen, err := store.At(firstTenantCtx, firstTenantID, firstRealmID, KindPlayer, "alice", morning.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, first.Content.ID, atTen.ExternalReferenceContent.ID)
	atOne, err := store.At(firstTenantCtx, firstTenantID, firstRealmID, KindPlayer, "alice", morning.Add(4*time.Hour))
	require.NoError(t, err)
	require.Equal(t, changed.Content.ID, atOne.ExternalReferenceContent.ID)

	secondTenantCtx := servicetenant.WithTenantID(ctx, secondTenantID)
	second, err := store.ObservePlayer(secondTenantCtx, secondTenantID, secondRealmID, "Alice", morning, PlayerSnapshot{Gear: map[string]any{"head": 1}})
	require.NoError(t, err)
	require.NotEqual(t, first.Content.ID, second.Content.ID)

	_, err = store.ObservePlayer(servicetenant.AdminBypass(ctx), firstTenantID, secondRealmID, "Wrong Realm", morning, PlayerSnapshot{})
	require.ErrorContains(t, err, "does not belong to tenant")

	_, err = store.Current(secondTenantCtx, first.Entity.ID)
	require.Error(t, err)
	require.True(t, errors.Is(err, pgx.ErrNoRows))
}

var tenantHooksOnce sync.Once

func configureTenantHooks() {
	tenantHooksOnce.Do(func() {
		database.PrepareConnFunc = servicetenant.PrepareConn
		database.ResetConnFunc = servicetenant.ResetConn
		database.CheckNestedTxFunc = servicetenant.CheckNestedTx
	})
}

func createReferenceRealm(t *testing.T, ctx context.Context, db database.Store) (uuid.UUID, uuid.UUID) {
	t.Helper()
	tenantID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	bypassCtx := servicetenant.AdminBypass(ctx)

	_, err := db.Exec(bypassCtx, `INSERT INTO tenants (id, name) VALUES ($1, $2)`, tenantID, "Reference tenant "+tenantID.String())
	require.NoError(t, err)
	_, err = db.Exec(bypassCtx, `INSERT INTO wow_servers (id, tenant_id, name) VALUES ($1, $2, $3)`, serverID, tenantID, "Reference server "+serverID.String())
	require.NoError(t, err)
	_, err = db.Exec(bypassCtx, `INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)`, realmID, serverID, "Reference realm "+realmID.String())
	require.NoError(t, err)
	return tenantID, realmID
}
