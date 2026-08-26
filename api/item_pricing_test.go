package api

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type instancePlayersStub struct {
	players []database.LogInstancePlayer
}

func (s instancePlayersStub) InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error) {
	return s.players, nil
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
