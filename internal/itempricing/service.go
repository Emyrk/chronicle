package itempricing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	ProviderWoWAuctions = "wowauctions"
	defaultBaseURL      = "https://api.wowauctions.net/emyrk"
	maxProviderBatch    = 100
)

type Client struct {
	baseURL    string
	authToken  string
	httpClient *http.Client
}

func NewClient(authToken, baseURL string, httpClient *http.Client) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		authToken:  authToken,
		httpClient: httpClient,
	}
}

func (c *Client) Prices(ctx context.Context, realmRoute string, faction int, itemIDs []int32) (map[int32]*int64, error) {
	if len(itemIDs) == 0 || len(itemIDs) > maxProviderBatch {
		return nil, fmt.Errorf("item pricing batch size must be between 1 and %d", maxProviderBatch)
	}

	entries := make([]string, len(itemIDs))
	prices := make(map[int32]*int64, len(itemIDs))
	for i, itemID := range itemIDs {
		entries[i] = strconv.FormatInt(int64(itemID), 10)
		prices[itemID] = nil
	}

	endpoint := fmt.Sprintf("%s/%s/%d?entries=%s", c.baseURL, url.PathEscape(realmRoute), faction, strings.Join(entries, ","))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create item pricing request: %w", err)
	}
	req.Header.Set("Authorization", c.authToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request item prices from provider: %s", sanitizeHTTPError(err))
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("item pricing provider returned HTTP %d", resp.StatusCode)
	}

	var tuples [][2]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&tuples); err != nil {
		return nil, fmt.Errorf("decode item prices: %w", err)
	}
	for _, tuple := range tuples {
		var itemID int32
		if err := json.Unmarshal(tuple[0], &itemID); err != nil {
			return nil, fmt.Errorf("decode item price ID: %w", err)
		}
		if _, requested := prices[itemID]; !requested {
			continue
		}
		if string(tuple[1]) == "null" {
			prices[itemID] = nil
			continue
		}
		var price int64
		if err := json.Unmarshal(tuple[1], &price); err != nil {
			return nil, fmt.Errorf("decode item %d price: %w", itemID, err)
		}
		prices[itemID] = &price
	}
	return prices, nil
}

func sanitizeHTTPError(err error) string {
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return urlErr.Err.Error()
	}
	return err.Error()
}

type Price struct {
	ItemID       int32
	PriceCopper  int64
	ObservedDate time.Time
}

type Store interface {
	GetItemPricingConfigByRealm(context.Context, uuid.UUID) (database.GetItemPricingConfigByRealmRow, error)
	ListObservedItemIDsForDate(context.Context, database.ListObservedItemIDsForDateParams) ([]int32, error)
	ListResolvedItemPrices(context.Context, database.ListResolvedItemPricesParams) ([]database.ListResolvedItemPricesRow, error)
	UpsertItemDailyPrice(context.Context, []database.UpsertItemDailyPriceParams) *database.UpsertItemDailyPriceBatchResults
}

type Service struct {
	db          Store
	client      *Client
	coordinator keyedCoordinator
	now         func() time.Time
}

func New(db Store, authToken, baseURL string) *Service {
	if authToken == "" {
		return nil
	}
	return &Service{
		db:     db,
		client: NewClient(authToken, baseURL, nil),
		now:    time.Now,
	}
}

func (s *Service) Resolve(
	ctx context.Context,
	realmID uuid.UUID,
	faction chroniclesdk.AuctionHouseFaction,
	requestedDate time.Time,
	itemIDs []int32,
) ([]Price, error) {
	itemIDs = normalizeItemIDs(itemIDs)
	if len(itemIDs) == 0 {
		return []Price{}, nil
	}

	config, err := s.db.GetItemPricingConfigByRealm(ctx, realmID)
	if err != nil {
		return nil, fmt.Errorf("get realm item pricing config: %w", err)
	}
	if !config.PricingProvider.Valid || config.PricingProvider.String != ProviderWoWAuctions ||
		!config.PricingRouteName.Valid || !config.PricingAuctionHouse.Valid {
		return nil, ErrUnavailable
	}

	requestedDate = dateUTC(requestedDate)
	resolved, err := s.listResolved(ctx, realmID, faction, requestedDate, itemIDs)
	if err != nil {
		return nil, err
	}
	missing := missingItemIDs(itemIDs, resolved)
	if len(missing) == 0 {
		return resolved, nil
	}

	today := dateUTC(s.now())
	unlock := s.coordinator.lock(fmt.Sprintf("%s:%s:%s", realmID, faction, today.Format(time.DateOnly)))
	defer unlock()

	observed, err := s.db.ListObservedItemIDsForDate(ctx, database.ListObservedItemIDsForDateParams{
		RealmID:             realmID,
		AuctionHouseFaction: string(faction),
		ItemIds:             missing,
		PriceDate:           pgtype.Date{Time: today, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("list observed item prices: %w", err)
	}
	missing = removeItemIDs(missing, observed)

	for chunk := range slices.Chunk(missing, maxProviderBatch) {
		providerFaction, err := providerFaction(config.PricingAuctionHouse.String, faction)
		if err != nil {
			return nil, err
		}
		prices, err := s.client.Prices(ctx, config.PricingRouteName.String, providerFaction, chunk)
		if err != nil {
			return nil, err
		}
		params := make([]database.UpsertItemDailyPriceParams, 0, len(chunk))
		for _, itemID := range chunk {
			price := prices[itemID]
			value := pgtype.Int8{}
			if price != nil {
				value = pgtype.Int8{Int64: *price, Valid: true}
			}
			params = append(params, database.UpsertItemDailyPriceParams{
				RealmID:             realmID,
				AuctionHouseFaction: string(faction),
				ItemID:              itemID,
				PriceDate:           pgtype.Date{Time: today, Valid: true},
				PriceCopper:         value,
			})
		}
		var batchErr error
		s.db.UpsertItemDailyPrice(ctx, params).Exec(func(_ int, err error) {
			if batchErr == nil && err != nil {
				batchErr = err
			}
		})
		if batchErr != nil {
			return nil, fmt.Errorf("store item prices: %w", batchErr)
		}
	}

	return s.listResolved(ctx, realmID, faction, requestedDate, itemIDs)
}

var ErrUnavailable = errors.New("item pricing is not configured")

func (s *Service) listResolved(ctx context.Context, realmID uuid.UUID, faction chroniclesdk.AuctionHouseFaction, requestedDate time.Time, itemIDs []int32) ([]Price, error) {
	rows, err := s.db.ListResolvedItemPrices(ctx, database.ListResolvedItemPricesParams{
		RealmID:             realmID,
		AuctionHouseFaction: string(faction),
		ItemIds:             itemIDs,
		RequestedDate:       pgtype.Date{Time: requestedDate, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("list resolved item prices: %w", err)
	}
	prices := make([]Price, 0, len(rows))
	for _, row := range rows {
		prices = append(prices, Price{
			ItemID:       row.ItemID,
			PriceCopper:  row.PriceCopper.Int64,
			ObservedDate: row.PriceDate.Time,
		})
	}
	return prices, nil
}

func providerFaction(mode string, faction chroniclesdk.AuctionHouseFaction) (int, error) {
	switch mode {
	case string(chroniclesdk.PricingAuctionHouseMerged):
		return 1, nil
	case string(chroniclesdk.PricingAuctionHouseSplit):
		switch faction {
		case chroniclesdk.AuctionHouseFactionAlliance:
			return 1, nil
		case chroniclesdk.AuctionHouseFactionHorde:
			return 2, nil
		}
	}
	return 0, ErrUnavailable
}

func dateUTC(t time.Time) time.Time {
	year, month, day := t.UTC().Date()
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func normalizeItemIDs(itemIDs []int32) []int32 {
	result := make([]int32, 0, len(itemIDs))
	seen := make(map[int32]struct{}, len(itemIDs))
	for _, itemID := range itemIDs {
		if itemID <= 0 {
			continue
		}
		if _, ok := seen[itemID]; ok {
			continue
		}
		seen[itemID] = struct{}{}
		result = append(result, itemID)
	}
	slices.Sort(result)
	return result
}

func missingItemIDs(itemIDs []int32, prices []Price) []int32 {
	resolved := make(map[int32]struct{}, len(prices))
	for _, price := range prices {
		resolved[price.ItemID] = struct{}{}
	}
	return removeItemIDs(itemIDs, mapsKeys(resolved))
}

func removeItemIDs(itemIDs, remove []int32) []int32 {
	removed := make(map[int32]struct{}, len(remove))
	for _, itemID := range remove {
		removed[itemID] = struct{}{}
	}
	result := make([]int32, 0, len(itemIDs))
	for _, itemID := range itemIDs {
		if _, ok := removed[itemID]; !ok {
			result = append(result, itemID)
		}
	}
	return result
}

func mapsKeys(values map[int32]struct{}) []int32 {
	keys := make([]int32, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

type keyedCoordinator struct {
	// Coordination is intentionally process-local. The database primary key and
	// idempotent upsert preserve correctness across multiple API replicas.
	mu    sync.Mutex
	locks map[string]*keyedLock
}

type keyedLock struct {
	mu   sync.Mutex
	refs int
}

func (c *keyedCoordinator) lock(key string) func() {
	c.mu.Lock()
	if c.locks == nil {
		c.locks = make(map[string]*keyedLock)
	}
	entry := c.locks[key]
	if entry == nil {
		entry = &keyedLock{}
		c.locks[key] = entry
	}
	entry.refs++
	c.mu.Unlock()

	entry.mu.Lock()
	return func() {
		entry.mu.Unlock()
		c.mu.Lock()
		entry.refs--
		if entry.refs == 0 {
			delete(c.locks, key)
		}
		c.mu.Unlock()
	}
}
