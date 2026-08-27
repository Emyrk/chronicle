package api

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/itempricing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type instancePlayersStub struct {
	players []database.LogInstancePlayer
}

func (s instancePlayersStub) InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error) {
	return s.players, nil
}

func TestValidateItemPriceIDs(t *testing.T) {
	t.Parallel()

	items, message := validateItemPriceIDs([]int32{3, 1, 3}, maxInstanceItemPrices)
	require.Empty(t, message)
	require.Equal(t, []int32{3, 1}, items)

	_, message = validateItemPriceIDs(nil, maxInstanceItemPrices)
	require.Equal(t, "item_ids must contain between 1 and 200 items", message)

	_, message = validateItemPriceIDs(make([]int32, maxInstanceItemPrices+1), maxInstanceItemPrices)
	require.Equal(t, "item_ids must contain between 1 and 200 items", message)

	_, message = validateItemPriceIDs([]int32{0}, maxInstanceItemPrices)
	require.Equal(t, "item_ids must contain only positive item IDs", message)
}

func TestItemPricesResponseFiltersToRequestedItems(t *testing.T) {
	t.Parallel()

	requestedDate := time.Date(2026, time.August, 27, 0, 0, 0, 0, time.UTC)
	response := itemPricesResponse(
		requestedDate,
		chroniclesdk.AuctionHouseFactionMerged,
		[]int32{8956},
		[]itempricing.Price{
			{ItemID: 8956, PriceCopper: 475, ObservedDate: requestedDate},
			{ItemID: 4306, PriceCopper: 1694, ObservedDate: requestedDate},
		},
	)

	require.Len(t, response.Prices, 1)
	require.Equal(t, int32(8956), response.Prices[0].ItemID)
	require.Equal(t, int64(475), *response.Prices[0].PriceCopper)
}

func TestValidPricingFaction(t *testing.T) {
	t.Parallel()
	require.True(t, validPricingFaction(string(chroniclesdk.PricingAuctionHouseMerged), chroniclesdk.AuctionHouseFactionMerged))
	require.False(t, validPricingFaction(string(chroniclesdk.PricingAuctionHouseMerged), chroniclesdk.AuctionHouseFactionAlliance))
	require.True(t, validPricingFaction(string(chroniclesdk.PricingAuctionHouseSplit), chroniclesdk.AuctionHouseFactionAlliance))
	require.True(t, validPricingFaction(string(chroniclesdk.PricingAuctionHouseSplit), chroniclesdk.AuctionHouseFactionHorde))
	require.False(t, validPricingFaction(string(chroniclesdk.PricingAuctionHouseSplit), chroniclesdk.AuctionHouseFactionMerged))
}

func TestInstancePricingFaction(t *testing.T) {
	t.Parallel()
	instanceID := uuid.New()

	t.Run("merged", func(t *testing.T) {
		faction, reason, err := instancePricingFaction(context.Background(), instancePlayersStub{}, instanceID, string(chroniclesdk.PricingAuctionHouseMerged))
		require.NoError(t, err)
		require.Empty(t, reason)
		require.Equal(t, chroniclesdk.AuctionHouseFactionMerged, faction)
	})

	t.Run("alliance", func(t *testing.T) {
		faction, reason, err := instancePricingFaction(context.Background(), instancePlayersStub{players: []database.LogInstancePlayer{
			{Race: database.WowPlayableRaceHuman},
			{Race: database.WowPlayableRaceDwarf},
		}}, instanceID, string(chroniclesdk.PricingAuctionHouseSplit))
		require.NoError(t, err)
		require.Empty(t, reason)
		require.Equal(t, chroniclesdk.AuctionHouseFactionAlliance, faction)
	})

	t.Run("mixed", func(t *testing.T) {
		faction, reason, err := instancePricingFaction(context.Background(), instancePlayersStub{players: []database.LogInstancePlayer{
			{Race: database.WowPlayableRaceHuman},
			{Race: database.WowPlayableRaceOrc},
		}}, instanceID, string(chroniclesdk.PricingAuctionHouseSplit))
		require.NoError(t, err)
		require.Empty(t, faction)
		require.Equal(t, "raid contains players from multiple factions", reason)
	})
}
