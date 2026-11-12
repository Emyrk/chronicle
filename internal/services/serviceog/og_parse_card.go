package serviceog

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/database"
)

// bossShareCard is what the OG service's parse template draws (template=parse)
// for a share of one boss kill: the kill time and the fight's top DPS and top
// HPS. Selected players are ignored. The template's player-parse layout (score,
// rank, player) stays in the renderer for design review; Chronicle doesn't
// select it.
type bossShareCard struct {
	Host  string
	Boss  string
	Raid  string
	Guild string
	// Duration is the kill time.
	Duration time.Duration
	// Top and Heal are the kill's top DPS and top HPS players.
	Top, Heal []raidCardDPS
}

// bossShareCardParams encodes card into the parse template's query params, for
// ogImageURL(r, "parse", bossShareCardParams(card)).
func bossShareCardParams(card bossShareCard) url.Values {
	q := url.Values{}
	setIf := func(k, v string) {
		if v != "" {
			q.Set(k, v)
		}
	}
	setIf("host", card.Host)
	setIf("boss", card.Boss)
	setIf("raid", card.Raid)
	setIf("guild", card.Guild)
	if card.Duration > 0 {
		q.Set("dur", strconv.Itoa(int(card.Duration.Seconds())))
	}
	setIf("top", raidCardTopParam(card.Top))
	setIf("heal", raidCardTopParam(card.Heal))
	return q
}

// sharedViewSelection is the part of a share payload's `view` the boss share
// card reads (frontend SharedViewPayload): encounters is "all" or indexes into
// the instance's encounters joined by '-'. Selected players are ignored.
type sharedViewSelection struct {
	View *struct {
		Encounters string `json:"encounters"`
	} `json:"view"`
}

// shareBossSelection returns the one boss kill a share payload's view
// selects, the way the instance page decodes it. ok is false for anything
// else (several bosses, "all", trash, a wipe), which keeps the raid report card.
func shareBossSelection(payload []byte, encounters []database.LogInstanceEncounter) (database.LogInstanceEncounter, bool) {
	var sel sharedViewSelection
	if err := json.Unmarshal(payload, &sel); err != nil || sel.View == nil {
		return database.LogInstanceEncounter{}, false
	}
	encIdx, err := strconv.Atoi(sel.View.Encounters)
	if err != nil || encIdx < 0 || encIdx >= len(encounters) {
		return database.LogInstanceEncounter{}, false
	}
	enc := encounters[encIdx]
	if !enc.Boss || (enc.KillType != database.KillTypeClean && enc.KillType != database.KillTypePartial) {
		return database.LogInstanceEncounter{}, false
	}
	return enc, true
}

// loadBossShareCard fills in base with the boss kill enc from the instance's
// ranking records, under raidCardTimeout derived from r's context.
//
// ok is false when the lookup fails or the kill has no ranked DPS or HPS; the
// caller then falls back to the raid report card.
func (s *Service) loadBossShareCard(r *http.Request, inst database.LogInstancesGuild, enc database.LogInstanceEncounter, base bossShareCard) (bossShareCard, bool) {
	ctx, cancel := context.WithTimeout(r.Context(), raidCardTimeout)
	defer cancel()
	records, err := s.store.InstanceRankingRecords(ctx, inst.ID)
	if err != nil {
		return base, false
	}
	return bossKillCard(base, records, enc)
}

// bossKillCard fills card with the kill time and the top DPS and top HPS on
// enc. ok is false when the kill has no ranked DPS or HPS.
func bossKillCard(card bossShareCard, records []database.EncounterDpsRankingsResolved, enc database.LogInstanceEncounter) (bossShareCard, bool) {
	card.Boss = enc.Name
	kill := make([]database.EncounterDpsRankingsResolved, 0, len(records))
	for _, rec := range records {
		if rec.EncounterID.Valid && rec.EncounterID.UUID == enc.ID {
			kill = append(kill, rec)
			if card.Duration == 0 && rec.DurationSecs > 0 {
				card.Duration = time.Duration(math.Round(rec.DurationSecs)) * time.Second
			}
		}
	}
	card.Top = raidTopDPS(kill, 1)
	card.Heal = raidTopHPS(kill, 1)
	return card, len(card.Top) > 0 || len(card.Heal) > 0
}
