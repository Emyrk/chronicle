package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type ItemPricingProvider string

const (
	ItemPricingProviderWoWAuctions ItemPricingProvider = "wowauctions"
)

type PricingAuctionHouse string

const (
	PricingAuctionHouseMerged PricingAuctionHouse = "merged"
	PricingAuctionHouseSplit  PricingAuctionHouse = "split"
)

type WoWServer struct {
	ID               uuid.UUID            `json:"id"`
	Name             string               `json:"name"`
	Description      string               `json:"description"`
	URL              *string              `json:"url,omitempty"`
	CreatedBy        *uuid.UUID           `json:"created_by,omitempty"`
	TenantID         *uuid.UUID           `json:"tenant_id,omitempty"`
	DefaultDatasetID *uuid.UUID           `json:"default_dataset_id,omitempty"`
	PricingProvider  *ItemPricingProvider `json:"pricing_provider,omitempty"`
}

type CreateWoWServerRequest struct {
	Name            string               `json:"name"`
	Description     string               `json:"description"`
	URL             *string              `json:"url,omitempty"`
	PricingProvider *ItemPricingProvider `json:"pricing_provider,omitempty"`
}

type WoWServerRealm struct {
	ID                  uuid.UUID            `json:"id"`
	ServerID            uuid.UUID            `json:"server_id"`
	Name                string               `json:"name"`
	Description         string               `json:"description"`
	URL                 *string              `json:"url,omitempty"`
	CreatedBy           *uuid.UUID           `json:"created_by,omitempty"`
	PricingRouteName    *string              `json:"pricing_route_name,omitempty"`
	PricingAuctionHouse *PricingAuctionHouse `json:"pricing_auction_house,omitempty"`
}

type CreateWoWServerRealmRequest struct {
	Name                string               `json:"name"`
	Description         string               `json:"description"`
	URL                 *string              `json:"url,omitempty"`
	PricingRouteName    *string              `json:"pricing_route_name,omitempty"`
	PricingAuctionHouse *PricingAuctionHouse `json:"pricing_auction_house,omitempty"`
}

type UploadKey struct {
	ID          uuid.UUID  `json:"id"`
	RealmID     uuid.UUID  `json:"realm_id"`
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	CreatedBy   *uuid.UUID `json:"created_by,omitempty"`
	// Secret is only populated on creation response (shown once).
	Secret string `json:"secret,omitempty"`
}

type CreateUploadKeyRequest struct {
	Description string `json:"description"`
}

type AzerothCorePingResponse struct {
	RealmName string `json:"realm_name"`
	Status    string `json:"status"`
}
