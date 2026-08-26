package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/itempricing"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxInstanceItemPrices = 100

func (api *API) ItemPricingRealms(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if api.Opts.ItemPricing == nil {
		httpapi.Write(ctx, w, http.StatusOK, []chroniclesdk.ItemPricingRealm{})
		return
	}

	rows, err := api.Opts.Zed.ListItemPricingRealms(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	realms := make([]chroniclesdk.ItemPricingRealm, 0, len(rows))
	for _, row := range rows {
		realms = append(realms, chroniclesdk.ItemPricingRealm{
			ID:           row.ID.String(),
			ServerName:   row.ServerName,
			RealmName:    row.RealmName,
			AuctionHouse: chroniclesdk.PricingAuctionHouse(row.PricingAuctionHouse.String),
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, realms)
}

func (api *API) CurrentItemPrices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.CurrentItemPricesRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if len(req.ItemIDs) == 0 || len(req.ItemIDs) > maxInstanceItemPrices {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "item_ids must contain between 1 and 100 items"})
		return
	}
	realmID, err := uuid.Parse(req.RealmID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid realm_id"})
		return
	}
	if api.Opts.ItemPricing == nil {
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "item pricing is not configured"})
		return
	}

	config, err := api.Opts.Zed.GetItemPricingConfigByRealm(ctx, realmID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "item pricing is not available for this realm"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !config.PricingAuctionHouse.Valid {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "item pricing is not available for this realm"})
		return
	}
	if !validPricingFaction(config.PricingAuctionHouse.String, req.Faction) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid faction for this realm's auction house"})
		return
	}

	requestedDate := time.Now().UTC()
	prices, err := api.Opts.ItemPricing.Resolve(ctx, realmID, req.Faction, requestedDate, req.ItemIDs)
	if errors.Is(err, itempricing.ErrUnavailable) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "item pricing is not available for this realm"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	response := itemPricesResponse(requestedDate, req.Faction, req.ItemIDs, prices)
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func validPricingFaction(mode string, faction chroniclesdk.AuctionHouseFaction) bool {
	switch mode {
	case string(chroniclesdk.PricingAuctionHouseMerged):
		return faction == chroniclesdk.AuctionHouseFactionMerged
	case string(chroniclesdk.PricingAuctionHouseSplit):
		return faction == chroniclesdk.AuctionHouseFactionAlliance || faction == chroniclesdk.AuctionHouseFactionHorde
	default:
		return false
	}
}

func (api *API) InstanceItemPrices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)
	requestedDate := time.Now().UTC()
	if inst.StartTime.Valid {
		requestedDate = inst.StartTime.Time.UTC()
	}
	response := chroniclesdk.InstanceItemPricesResponse{
		RequestedDate: requestedDate.Format(time.DateOnly),
		Prices:        []chroniclesdk.InstanceItemPrice{},
	}

	var req chroniclesdk.InstanceItemPricesRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if len(req.ItemIDs) == 0 || len(req.ItemIDs) > maxInstanceItemPrices {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "item_ids must contain between 1 and 100 items"})
		return
	}
	if api.Opts.ItemPricing == nil {
		response.Reason = "item pricing is not configured"
		httpapi.Write(ctx, w, http.StatusOK, response)
		return
	}

	config, err := api.Opts.Zed.GetItemPricingConfigByRealm(ctx, inst.RealmID)
	if err != nil || !config.PricingAuctionHouse.Valid {
		response.Reason = "item pricing is not available for this realm"
		httpapi.Write(ctx, w, http.StatusOK, response)
		return
	}

	faction, reason, err := instancePricingFaction(ctx, api.Opts.Zed, inst.ID, config.PricingAuctionHouse.String)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if reason != "" {
		response.Reason = reason
		httpapi.Write(ctx, w, http.StatusOK, response)
		return
	}
	response.Faction = &faction

	prices, err := api.Opts.ItemPricing.Resolve(ctx, inst.RealmID, faction, requestedDate, req.ItemIDs)
	if errors.Is(err, itempricing.ErrUnavailable) {
		response.Reason = "item pricing is not available for this realm"
		httpapi.Write(ctx, w, http.StatusOK, response)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	response = itemPricesResponse(requestedDate, faction, req.ItemIDs, prices)
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func itemPricesResponse(requestedDate time.Time, faction chroniclesdk.AuctionHouseFaction, itemIDs []int32, prices []itempricing.Price) chroniclesdk.InstanceItemPricesResponse {
	response := chroniclesdk.InstanceItemPricesResponse{
		Available:     true,
		RequestedDate: requestedDate.UTC().Format(time.DateOnly),
		Faction:       &faction,
		Prices:        make([]chroniclesdk.InstanceItemPrice, 0, len(itemIDs)),
	}
	byItem := make(map[int32]itempricing.Price, len(prices))
	for _, price := range prices {
		byItem[price.ItemID] = price
	}
	for _, itemID := range uniquePositiveItemIDs(itemIDs) {
		result := chroniclesdk.InstanceItemPrice{ItemID: itemID}
		if price, ok := byItem[itemID]; ok {
			priceCopper := price.PriceCopper
			result.PriceCopper = &priceCopper
			result.ObservedDate = price.ObservedDate.Format(time.DateOnly)
			result.FutureFallback = result.ObservedDate != response.RequestedDate
		}
		response.Prices = append(response.Prices, result)
	}
	return response
}

type instancePlayersStore interface {
	InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error)
}

func instancePricingFaction(ctx context.Context, db instancePlayersStore, instanceID uuid.UUID, mode string) (chroniclesdk.AuctionHouseFaction, string, error) {
	if mode == string(chroniclesdk.PricingAuctionHouseMerged) {
		return chroniclesdk.AuctionHouseFactionMerged, "", nil
	}
	if mode != string(chroniclesdk.PricingAuctionHouseSplit) {
		return "", "item pricing is not available for this realm", nil
	}

	players, err := db.InstancePlayersByInstanceID(ctx, instanceID)
	if err != nil {
		return "", "", err
	}
	var found chroniclesdk.AuctionHouseFaction
	for _, player := range players {
		faction := raceFaction(player.Race)
		if faction == "" {
			continue
		}
		if found != "" && found != faction {
			return "", "raid contains players from multiple factions", nil
		}
		found = faction
	}
	if found == "" {
		return "", "could not determine the raid faction", nil
	}
	return found, "", nil
}

func raceFaction(race database.WowPlayableRace) chroniclesdk.AuctionHouseFaction {
	switch race {
	case database.WowPlayableRaceHuman,
		database.WowPlayableRaceGnome,
		database.WowPlayableRaceDwarf,
		database.WowPlayableRaceNightElf,
		database.WowPlayableRaceDraenei:
		return chroniclesdk.AuctionHouseFactionAlliance
	case database.WowPlayableRaceScourge,
		database.WowPlayableRaceOrc,
		database.WowPlayableRaceTroll,
		database.WowPlayableRaceTauren,
		database.WowPlayableRaceGoblin,
		database.WowPlayableRaceBloodElf:
		return chroniclesdk.AuctionHouseFactionHorde
	default:
		return ""
	}
}

func uniquePositiveItemIDs(itemIDs []int32) []int32 {
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
	return result
}
