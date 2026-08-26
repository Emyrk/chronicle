package chroniclesdk

type AuctionHouseFaction string

const (
	AuctionHouseFactionMerged   AuctionHouseFaction = "merged"
	AuctionHouseFactionAlliance AuctionHouseFaction = "alliance"
	AuctionHouseFactionHorde    AuctionHouseFaction = "horde"
)

type ItemPricingRealm struct {
	ID           string              `json:"id"`
	ServerName   string              `json:"server_name"`
	RealmName    string              `json:"realm_name"`
	AuctionHouse PricingAuctionHouse `json:"auction_house"`
}

type CurrentItemPricesRequest struct {
	RealmID string              `json:"realm_id"`
	Faction AuctionHouseFaction `json:"faction"`
	ItemIDs []int32             `json:"item_ids"`
}

type InstanceItemPricesRequest struct {
	ItemIDs []int32 `json:"item_ids"`
}

type InstanceItemPrice struct {
	ItemID         int32  `json:"item_id"`
	PriceCopper    *int64 `json:"price_copper,omitempty"`
	ObservedDate   string `json:"observed_date,omitempty"`
	FutureFallback bool   `json:"future_fallback"`
}

type InstanceItemPricesResponse struct {
	Available     bool                 `json:"available"`
	Reason        string               `json:"reason,omitempty"`
	RequestedDate string               `json:"requested_date"`
	Faction       *AuctionHouseFaction `json:"faction,omitempty"`
	Prices        []InstanceItemPrice  `json:"prices"`
}
