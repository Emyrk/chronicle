-- name: GetItemPricingConfigByRealm :one
SELECT
    ws.pricing_provider,
    wsr.pricing_route_name,
    wsr.pricing_auction_house
FROM wow_server_realms wsr
JOIN wow_servers ws ON ws.id = wsr.server_id
WHERE wsr.id = @realm_id;

-- name: ListResolvedItemPrices :many
SELECT DISTINCT ON (item_id)
    item_id,
    price_copper,
    price_date
FROM item_daily_prices
WHERE realm_id = @realm_id
  AND auction_house_faction = @auction_house_faction
  AND item_id = ANY(@item_ids::int[])
  AND price_copper IS NOT NULL
  AND price_date >= @requested_date
ORDER BY item_id, price_date;

-- name: ListObservedItemIDsForDate :many
SELECT item_id
FROM item_daily_prices
WHERE realm_id = @realm_id
  AND auction_house_faction = @auction_house_faction
  AND item_id = ANY(@item_ids::int[])
  AND price_date = @price_date;

-- name: UpsertItemDailyPrice :batchexec
INSERT INTO item_daily_prices (
    realm_id,
    auction_house_faction,
    item_id,
    price_date,
    price_copper
)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (realm_id, auction_house_faction, item_id, price_date)
DO UPDATE SET
    price_copper = EXCLUDED.price_copper,
    fetched_at = now();
