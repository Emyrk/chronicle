BEGIN;

ALTER TABLE wow_servers
    ADD COLUMN pricing_provider TEXT
    CHECK (pricing_provider IS NULL OR pricing_provider = 'wowauctions');

ALTER TABLE wow_server_realms
    ADD COLUMN pricing_route_name TEXT,
    ADD COLUMN pricing_auction_house TEXT
    CHECK (pricing_auction_house IS NULL OR pricing_auction_house IN ('merged', 'split')),
    ADD CONSTRAINT wow_server_realms_pricing_config_complete CHECK (
        (pricing_route_name IS NULL AND pricing_auction_house IS NULL)
        OR (pricing_route_name <> '' AND pricing_auction_house IS NOT NULL)
    );

CREATE TABLE item_daily_prices (
    realm_id UUID NOT NULL REFERENCES wow_server_realms(id) ON DELETE CASCADE,
    auction_house_faction TEXT NOT NULL
        CHECK (auction_house_faction IN ('merged', 'alliance', 'horde')),
    item_id INTEGER NOT NULL CHECK (item_id > 0),
    price_date DATE NOT NULL,
    price_copper BIGINT CHECK (price_copper IS NULL OR price_copper >= 0),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (realm_id, auction_house_faction, item_id, price_date)
);

ALTER TABLE item_daily_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_daily_prices FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_bypass ON item_daily_prices
    USING (current_setting('app.tenant_bypass', true) = 'true');

CREATE POLICY tenant_item_price_isolation ON item_daily_prices
    USING (realm_id IN (SELECT id FROM wow_server_realms));

CREATE INDEX item_daily_prices_future_lookup_idx
    ON item_daily_prices (realm_id, auction_house_faction, item_id, price_date)
    WHERE price_copper IS NOT NULL;

COMMIT;
