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
)

const maxInstanceItemPrices = 100

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

	byItem := make(map[int32]itempricing.Price, len(prices))
	for _, price := range prices {
		byItem[price.ItemID] = price
	}
	response.Available = true
	for _, itemID := range uniquePositiveItemIDs(req.ItemIDs) {
		result := chroniclesdk.InstanceItemPrice{ItemID: itemID}
		if price, ok := byItem[itemID]; ok {
			priceCopper := price.PriceCopper
			result.PriceCopper = &priceCopper
			result.ObservedDate = price.ObservedDate.Format(time.DateOnly)
			result.FutureFallback = result.ObservedDate != response.RequestedDate
		}
		response.Prices = append(response.Prices, result)
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
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
