package itempricing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestResolveCoordinatesOverlappingItemSets(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t, dbtestutil.WithTimezone("UTC"))

	server, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID:              uuid.New(),
		Name:            t.Name(),
		PricingProvider: pgtype.Text{String: ProviderWoWAuctions, Valid: true},
	})
	require.NoError(t, err)
	realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:                  uuid.New(),
		ServerID:            server.ID,
		Name:                t.Name(),
		PricingRouteName:    pgtype.Text{String: "test-realm", Valid: true},
		PricingAuctionHouse: pgtype.Text{String: string(chroniclesdk.PricingAuctionHouseMerged), Valid: true},
	})
	require.NoError(t, err)

	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	var callsMu sync.Mutex
	var calls []string
	providerErrors := make(chan error, 10)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "test-token" {
			providerErrors <- fmt.Errorf("authorization header = %q", got)
		}
		if got := r.URL.Path; got != "/test-realm/1" {
			providerErrors <- fmt.Errorf("request path = %q", got)
		}
		entries := r.URL.Query().Get("entries")
		callsMu.Lock()
		calls = append(calls, entries)
		callNumber := len(calls)
		callsMu.Unlock()
		if callNumber == 1 {
			close(firstStarted)
			<-releaseFirst
		}

		response := make([][2]any, 0)
		for _, entry := range strings.Split(entries, ",") {
			var itemID int32
			if err := json.Unmarshal([]byte(entry), &itemID); err != nil {
				providerErrors <- err
				return
			}
			response = append(response, [2]any{itemID, int64(itemID) * 100})
		}
		if err := json.NewEncoder(w).Encode(response); err != nil {
			providerErrors <- err
		}
	}))
	t.Cleanup(provider.Close)

	service := New(db, "test-token", provider.URL)
	service.now = func() time.Time { return time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC) }
	requestedDate := time.Date(2026, time.August, 20, 0, 0, 0, 0, time.UTC)

	type result struct {
		prices []Price
		err    error
	}
	firstResult := make(chan result, 1)
	secondResult := make(chan result, 1)
	go func() {
		prices, err := service.Resolve(ctx, realm.ID, chroniclesdk.AuctionHouseFactionMerged, requestedDate, []int32{1, 2, 3})
		firstResult <- result{prices: prices, err: err}
	}()
	select {
	case <-firstStarted:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	go func() {
		prices, err := service.Resolve(ctx, realm.ID, chroniclesdk.AuctionHouseFactionMerged, requestedDate, []int32{3, 4})
		secondResult <- result{prices: prices, err: err}
	}()
	close(releaseFirst)

	first := <-firstResult
	second := <-secondResult
	require.NoError(t, first.err)
	require.NoError(t, second.err)
	require.Len(t, first.prices, 3)
	require.Len(t, second.prices, 2)

	callsMu.Lock()
	defer callsMu.Unlock()
	require.Equal(t, []string{"1,2,3", "4"}, calls)
	select {
	case err := <-providerErrors:
		require.NoError(t, err)
	default:
	}
}

func TestClientPricesPreservesNulls(t *testing.T) {
	t.Parallel()
	requestHeaders := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestHeaders <- r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`[[4306,542],[4338,null]]`))
	}))
	t.Cleanup(server.Close)

	prices, err := NewClient("secret", server.URL, server.Client()).Prices(context.Background(), "gehennas", 1, []int32{4306, 4338})
	require.NoError(t, err)
	require.Equal(t, "secret", <-requestHeaders)
	require.Equal(t, int64(542), *prices[4306])
	require.Nil(t, prices[4338])
}
