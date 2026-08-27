BEGIN;

DROP TABLE item_daily_prices;

ALTER TABLE wow_server_realms
    DROP CONSTRAINT wow_server_realms_pricing_config_complete,
    DROP COLUMN pricing_auction_house,
    DROP COLUMN pricing_route_name;

ALTER TABLE wow_servers
    DROP COLUMN pricing_provider;

COMMIT;
