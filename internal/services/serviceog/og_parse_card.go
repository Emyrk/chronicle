package serviceog

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/wowspec"
)

// parseCardMinScore is the lowest parse the parse card brags about. Below it
// (or with no parse) the card leads with DPS / HPS and the raid rank.
const parseCardMinScore = 75

// parseCard is what the OG service's parse template draws (template=parse):
// one player on one boss kill.
type parseCard struct {
	Host   string
	Player string
	Class  string
	Spec   string
	Boss   string
	Raid   string
	Guild  string
	Realm  string
	// Metric is "dps" or "hps" (healers).
	Metric string
	Value  float64
	// Duration is the kill time.
	Duration time.Duration
	// Score, Rank and Of are the boss parse; nil below parseCardMinScore or
	// when the boss isn't scored. The card then leads with Value.
	Score, Rank, Of *int
	// RaidRank is the player's place in the raid by Metric on this kill.
	RaidRank int
}

// parseCardParams encodes card into the parse template's query params, for
// ogImageURL(r, "parse", parseCardParams(card)).
func parseCardParams(card parseCard) url.Values {
	q := url.Values{}
	setIf := func(k, v string) {
		if v != "" {
			q.Set(k, v)
		}
	}
	setIf("host", card.Host)
	setIf("player", card.Player)
	setIf("class", card.Class)
	setIf("spec", card.Spec)
	setIf("boss", card.Boss)
	setIf("raid", card.Raid)
	setIf("guild", card.Guild)
	setIf("realm", card.Realm)
	setIf("metric", card.Metric)
	if card.Value > 0 {
		q.Set("value", strconv.FormatFloat(card.Value, 'f', 1, 64))
	}
	if card.Duration > 0 {
		q.Set("dur", strconv.Itoa(int(card.Duration.Seconds())))
	}
	if card.Score != nil {
		q.Set("score", strconv.Itoa(*card.Score))
		if card.Rank != nil && card.Of != nil {
			q.Set("rank", strconv.Itoa(*card.Rank))
			q.Set("of", strconv.Itoa(*card.Of))
		}
	}
	if card.RaidRank > 0 {
		q.Set("raidrank", strconv.Itoa(card.RaidRank))
	}
	return q
}

// sharedViewSelection is the part of a share payload's `view` the parse card
// reads (frontend SharedViewPayload): encounters is "all" or indexes into the
// instance's encounters joined by '-'; players are indexes into the sorted
// player GUIDs.
type sharedViewSelection struct {
	View *struct {
		Encounters string `json:"encounters"`
		Players    []int  `json:"players"`
	} `json:"view"`
}

// shareParseSelection returns the one player and boss kill a share payload's
// view selects, the way the instance page decodes it. ok is false for
// anything else (several or no players, several bosses, "all", trash, a
// wipe), which keeps the raid report card.
func shareParseSelection(payload []byte, encounters []database.LogInstanceEncounter, players []database.LogInstancePlayer) (database.LogInstancePlayer, database.LogInstanceEncounter, bool) {
	var sel sharedViewSelection
	if err := json.Unmarshal(payload, &sel); err != nil || sel.View == nil {
		return database.LogInstancePlayer{}, database.LogInstanceEncounter{}, false
	}

	encIdx, err := strconv.Atoi(sel.View.Encounters)
	if err != nil || encIdx < 0 || encIdx >= len(encounters) {
		return database.LogInstancePlayer{}, database.LogInstanceEncounter{}, false
	}
	enc := encounters[encIdx]
	if !enc.Boss || (enc.KillType != database.KillTypeClean && enc.KillType != database.KillTypePartial) {
		return database.LogInstancePlayer{}, database.LogInstanceEncounter{}, false
	}

	// Object.keys(instance.players).sort(): one entry per GUID, keyed by
	// its 0x%016X string.
	byGUID := make(map[string]database.LogInstancePlayer, len(players))
	for _, p := range players {
		byGUID[p.UnitGuid.String()] = p
	}
	guids := make([]string, 0, len(byGUID))
	for g := range byGUID {
		guids = append(guids, g)
	}
	sort.Strings(guids)
	selected := map[int]struct{}{}
	for _, i := range sel.View.Players {
		if i >= 0 && i < len(guids) {
			selected[i] = struct{}{}
		}
	}
	if len(selected) != 1 {
		return database.LogInstancePlayer{}, database.LogInstanceEncounter{}, false
	}
	for i := range selected {
		return byGUID[guids[i]], enc, true
	}
	return database.LogInstancePlayer{}, database.LogInstanceEncounter{}, false
}

// loadParseCard fills in base with player's numbers on the boss kill enc:
// DPS or HPS by role, kill time and raid rank from the instance's ranking
// records, and the boss parse from servicerankings.InstanceBossParse (the
// instance parses endpoint's rules). Both lookups run in parallel under
// raidCardTimeout derived from r's context, which carries the tenant.
//
// ok is false when the player has no ranking record for the kill (or the
// lookup failed); the caller then falls back to the raid report card.
func (s *Service) loadParseCard(r *http.Request, inst database.LogInstancesGuild, player database.LogInstancePlayer, enc database.LogInstanceEncounter, base parseCard) (parseCard, bool) {
	ctx, cancel := context.WithTimeout(r.Context(), raidCardTimeout)
	defer cancel()
	db := s.store
	playerGUID := player.UnitGuid.String()

	// Each goroutine writes only its own variables; all are read after Wait.
	var (
		wg         sync.WaitGroup
		records    []database.EncounterDpsRanking
		recordsErr error
		parse      servicerankings.BossParse
		parsed     bool
	)
	wg.Go(func() {
		records, recordsErr = db.InstanceRankingRecords(ctx, inst.ID)
	})
	wg.Go(func() {
		var err error
		parse, parsed, err = servicerankings.InstanceBossParse(ctx, db, inst.ID, playerGUID, enc.Name)
		parsed = parsed && err == nil
	})
	wg.Wait()
	if recordsErr != nil {
		return base, false
	}

	card := base
	card.Boss = enc.Name
	healer, ok := parseCardKill(&card, records, enc, player.UnitGuid)
	if !ok {
		return base, false
	}
	if parsed {
		// The parse's metric is the parses page's call on the role.
		healer = parse.Metric == parsepolicy.MetricHPS
	}
	card.Metric = "dps"
	if healer {
		card.Metric = "hps"
	}
	card.Value, card.RaidRank = raidMetricRank(records, enc, playerGUID, healer)
	if card.Value <= 0 {
		return base, false
	}
	if parsed && parse.Score >= parseCardMinScore {
		score, rank, of := parse.Score, parse.Rank, parse.SampleSize
		card.Score = &score
		if rank > 0 && of > 0 {
			card.Rank, card.Of = &rank, &of
		}
	}
	return card, true
}

// parseCardKill fills card's name, class, spec and kill time from player's
// ranking record on enc and reports whether the record calls them a healer.
// ok is false when there is no record.
func parseCardKill(card *parseCard, records []database.EncounterDpsRanking, enc database.LogInstanceEncounter, player guid.GUID) (healer, ok bool) {
	playerGUID := player.String()
	for _, rec := range records {
		if !rec.EncounterID.Valid || rec.EncounterID.UUID != enc.ID || rec.PlayerGuid != playerGUID {
			continue
		}
		if name := ogCardName(rec.PlayerName); name != "" {
			card.Player = name
		}
		if class := ogClassSlug(rec.PlayerClass); class != "" {
			card.Class = class
		}
		if spec := rec.PlayerSpec; spec != "" && !strings.EqualFold(spec, "unknown") {
			card.Spec = spec
		}
		if rec.DurationSecs > 0 {
			card.Duration = time.Duration(math.Round(rec.DurationSecs)) * time.Second
		}
		return rec.PlayerRole == wowspec.RoleHeal, true
	}
	return false, false
}

// raidMetricRank returns playerGUID's DPS (or HPS) on the kill enc and their
// 1-based place in the raid by it.
func raidMetricRank(records []database.EncounterDpsRanking, enc database.LogInstanceEncounter, playerGUID string, healer bool) (value float64, rank int) {
	best := map[string]float64{}
	for _, rec := range records {
		if !rec.EncounterID.Valid || rec.EncounterID.UUID != enc.ID {
			continue
		}
		v := rec.Dps
		if healer {
			v = rec.Hps
		}
		best[rec.PlayerGuid] = max(best[rec.PlayerGuid], v)
	}
	value, ok := best[playerGUID]
	if !ok || value <= 0 {
		return 0, 0
	}
	rank = 1
	for g, v := range best {
		if g != playerGUID && v > value {
			rank++
		}
	}
	return value, rank
}
