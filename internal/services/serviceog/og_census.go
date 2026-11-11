package serviceog

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
)

// censusOGDays matches the census page's default window.
const censusOGDays = 90

var censusOGMetadata = staticOGMetadata{Title: "Realm Census", Description: "Explore character and population statistics."}

// censusOG is /census: the static metadata plus, with cached counts, the
// Horde versus Alliance card. With no OG service, or no counted faction
// (e.g. a realm that only logs Unknown races), withBrandOG gives the brand card.
func (s *Service) censusOG(r *http.Request) *frontend.OGData {
	flavor := s.resolvedSiteFlavor(r.Context())
	og := flavorStaticOG("/census", seoProductName(flavor), censusOGMetadata, canonicalRequestURL(s, r))
	if !s.ogServiceConfigured() || s.store == nil {
		return og
	}
	rows := loadOGCache(r, s.logger, &s.ogCensus, func(ctx context.Context) ([]database.CensusPlayerCountsRow, error) {
		return s.store.CensusPlayerCounts(ctx, database.CensusPlayerCountsParams{
			UpdatedAfter: pgtype.Timestamptz{Time: time.Now().AddDate(0, 0, -censusOGDays), Valid: true},
			RealmIds:     nil,
		})
	})
	if params := censusOGParams(rows, flavor); params != nil {
		og.ImageURL = s.ogImageURL(r, "census", params)
	}
	return og
}

// censusOGParams counts each faction, or nil when neither has anyone.
func censusOGParams(rows []database.CensusPlayerCountsRow, flavor database.WoWFlavor) url.Values {
	var horde, alliance int64
	for _, row := range rows {
		switch censusFaction(row.Race, flavor) {
		case "horde":
			horde += row.Count
		case "alliance":
			alliance += row.Count
		}
	}
	if horde == 0 && alliance == 0 {
		return nil
	}
	return url.Values{
		"horde":    {strconv.FormatInt(horde, 10)},
		"alliance": {strconv.FormatInt(alliance, 10)},
		"days":     {strconv.Itoa(censusOGDays)},
	}
}

// censusFaction matches the census page's raceFaction (Census/censusRace.ts):
// on Nightmare of Ursol flavors the BloodElf race is the Alliance High Elf.
func censusFaction(race database.WowPlayableRace, flavor database.WoWFlavor) string {
	switch race {
	case database.WowPlayableRaceOrc, database.WowPlayableRaceTroll, database.WowPlayableRaceTauren,
		database.WowPlayableRaceScourge, database.WowPlayableRaceGoblin:
		return "horde"
	case database.WowPlayableRaceHuman, database.WowPlayableRaceDwarf, database.WowPlayableRaceGnome,
		database.WowPlayableRaceNightElf, database.WowPlayableRaceDraenei:
		return "alliance"
	case database.WowPlayableRaceBloodElf:
		if flavor.Has(database.FlavorNightmareOfUrsol) {
			return "alliance"
		}
		return "horde"
	default:
		return ""
	}
}
