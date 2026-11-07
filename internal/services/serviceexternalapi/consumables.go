package serviceexternalapi

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/database"
	"google.golang.org/protobuf/proto"
)

type ConsumablesResponse struct {
	Instance SummaryInstance `json:"instance"`
	// Pulls lists boss pulls with each player's consumables on that pull.
	Pulls []ConsumablePull `json:"pulls"`
	// Players totals the whole instance, trash included, as the Consumables
	// panel does with every encounter selected.
	Players []PlayerConsumables `json:"players"`
}

type ConsumablePull struct {
	SummaryPull
	Players []PlayerConsumables `json:"players"`
}

type PlayerConsumables struct {
	Player      SummaryPlayer     `json:"player"`
	Total       int               `json:"total"`
	Consumables []ConsumableCount `json:"consumables"`
}

// ConsumableCount groups physical uses of one item. CandidateItemIDs is set
// when Chronicle could only narrow a use to several possible items.
type ConsumableCount struct {
	Name             string  `json:"name"`
	ItemID           *int32  `json:"item_id,omitempty"`
	CandidateItemIDs []int32 `json:"candidate_item_ids,omitempty"`
	Count            int     `json:"count"`
	// ActiveAtPull counts uses only seen as a buff already active when the
	// pull started (pre-potions, flasks and elixirs from before the pull).
	ActiveAtPull int `json:"active_at_pull,omitempty"`
	// PreCombat counts uses observed outside combat with no lasting effect.
	PreCombat int `json:"pre_combat,omitempty"`

	key string
}

// consumableUse is one physical use: every observation sharing a consumeId.
// Field semantics follow consumables.processor.ts.
type consumableUse struct {
	consumeID          string
	player             string
	itemID             *int32
	candidateItemIDs   []int32
	candidateEffect    string
	candidateSpellID   int32
	spellName          string
	activeAtPullOnly   bool
	preCombat          bool
	firstObservedIndex int
}

type consumableAccumulator struct {
	seenEvidence map[string]struct{}
	uses         map[string]*consumableUse
	order        int
}

func newConsumableAccumulator() *consumableAccumulator {
	return &consumableAccumulator{seenEvidence: make(map[string]struct{}), uses: make(map[string]*consumableUse)}
}

func (a *consumableAccumulator) add(event *chronicleproto.Consume) {
	// A projected copy repeats an observation already counted in another
	// encounter; the stable evidenceId makes the duplicate detectable.
	if _, ok := a.seenEvidence[event.GetEvidenceId()]; ok {
		return
	}
	a.seenEvidence[event.GetEvidenceId()] = struct{}{}

	use, ok := a.uses[event.GetConsumeId()]
	if !ok {
		use = &consumableUse{consumeID: event.GetConsumeId(), player: event.GetPlayer(), activeAtPullOnly: true, firstObservedIndex: a.order}
		a.order++
		a.uses[event.GetConsumeId()] = use
	}
	kind := event.GetKind()
	spellID := event.GetSpellData().GetId()
	if use.itemID == nil && event.ItemId != nil {
		itemID := event.GetItemId()
		use.itemID = &itemID
	}
	if len(use.candidateItemIDs) == 0 && len(event.GetCandidateItemIds()) > 0 {
		use.candidateItemIDs = append([]int32(nil), event.GetCandidateItemIds()...)
		switch kind {
		case chronicleproto.EvidenceKind_EvidenceAura, chronicleproto.EvidenceKind_EvidenceActiveAtPull:
			use.candidateEffect = "buff"
		case chronicleproto.EvidenceKind_EvidenceCast, chronicleproto.EvidenceKind_EvidenceHeal:
			use.candidateEffect = "direct"
		}
		use.candidateSpellID = spellID
	}
	if use.spellName == "" {
		use.spellName = event.GetSpellData().GetName()
	}
	if kind != chronicleproto.EvidenceKind_EvidenceActiveAtPull {
		use.activeAtPullOnly = false
	}
	if kind == chronicleproto.EvidenceKind_EvidencePreCombat {
		use.preCombat = true
	}
}

// resolve applies curated dataset disambiguations, as resolveConsumableUse.
func (u consumableUse) resolve(disambiguations map[string]int32) consumableUse {
	if u.itemID != nil || u.candidateEffect == "" || u.candidateSpellID == 0 {
		return u
	}
	itemID, ok := disambiguations[u.candidateEffect+":"+strconv.Itoa(int(u.candidateSpellID))]
	if !ok {
		return u
	}
	for _, candidate := range u.candidateItemIDs {
		if candidate == itemID {
			u.itemID = &itemID
			return u
		}
	}
	return u
}

// identity mirrors itemIdentity in consumablesTotalLogic.ts.
func (u consumableUse) identity() (key string, itemID *int32, candidates []int32) {
	if u.itemID != nil {
		return fmt.Sprintf("item:%d", *u.itemID), u.itemID, nil
	}
	candidates = append([]int32(nil), u.candidateItemIDs...)
	sort.Slice(candidates, func(i, j int) bool { return candidates[i] < candidates[j] })
	switch {
	case len(candidates) == 1:
		return fmt.Sprintf("item:%d", candidates[0]), &candidates[0], nil
	case len(candidates) > 1:
		parts := make([]string, len(candidates))
		for i, candidate := range candidates {
			parts[i] = strconv.Itoa(int(candidate))
		}
		return "candidates:" + strings.Join(parts, ","), nil, candidates
	default:
		return "unknown-item", nil, nil
	}
}

// aggregate groups uses by player, then by item identity, like
// aggregateConsumablesTotal. Players are ordered by name.
func (a *consumableAccumulator) aggregate(c *summaryContext, disambiguations map[string]int32, itemNames map[int32]string) []PlayerConsumables {
	uses := make([]*consumableUse, 0, len(a.uses))
	for _, use := range a.uses {
		uses = append(uses, use)
	}
	sort.Slice(uses, func(i, j int) bool { return uses[i].firstObservedIndex < uses[j].firstObservedIndex })

	byPlayer := make(map[string]*PlayerConsumables)
	counts := make(map[string]map[string]*ConsumableCount)
	for _, raw := range uses {
		use := raw.resolve(disambiguations)
		player, ok := byPlayer[use.player]
		if !ok {
			player = &PlayerConsumables{Player: c.player(use.player)}
			byPlayer[use.player] = player
			counts[use.player] = make(map[string]*ConsumableCount)
		}
		player.Total++
		key, itemID, candidates := use.identity()
		count, ok := counts[use.player][key]
		if !ok {
			count = &ConsumableCount{key: key, ItemID: itemID, CandidateItemIDs: candidates, Name: consumableName(use, itemID, candidates, itemNames)}
			counts[use.player][key] = count
		}
		count.Count++
		if use.activeAtPullOnly {
			count.ActiveAtPull++
		}
		if use.preCombat {
			count.PreCombat++
		}
	}

	out := make([]PlayerConsumables, 0, len(byPlayer))
	for id, player := range byPlayer {
		player.Consumables = make([]ConsumableCount, 0, len(counts[id]))
		for _, count := range counts[id] {
			player.Consumables = append(player.Consumables, *count)
		}
		sort.Slice(player.Consumables, func(i, j int) bool {
			a, b := player.Consumables[i], player.Consumables[j]
			aPossible, bPossible := len(a.CandidateItemIDs) > 1, len(b.CandidateItemIDs) > 1
			if aPossible != bPossible {
				return bPossible
			}
			if a.Count != b.Count {
				return a.Count > b.Count
			}
			return a.key < b.key
		})
		out = append(out, *player)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Player.Name != out[j].Player.Name {
			return out[i].Player.Name < out[j].Player.Name
		}
		return out[i].Player.GUID < out[j].Player.GUID
	})
	return out
}

func consumableName(use consumableUse, itemID *int32, candidates []int32, itemNames map[int32]string) string {
	if itemID != nil {
		if name := itemNames[*itemID]; name != "" {
			return name
		}
	}
	if use.spellName != "" {
		return use.spellName
	}
	if itemID != nil {
		return fmt.Sprintf("Item %d", *itemID)
	}
	if len(candidates) > 0 {
		parts := make([]string, len(candidates))
		for i, candidate := range candidates {
			parts[i] = strconv.Itoa(int(candidate))
		}
		return "Item " + strings.Join(parts, "/")
	}
	return "Unknown Consumable"
}

type consumablesSummary struct {
	instance SummaryInstance
	pulls    []ConsumablePull
	players  []PlayerConsumables
}

func (s *Service) computeConsumablesSummary(ctx context.Context, instance database.LogInstancesGuild) (*consumablesSummary, error) {
	return s.consumablesCache.get(instance.ID, func() (*consumablesSummary, error) {
		summaryCtx, err := s.loadSummaryContext(ctx, instance)
		if err != nil {
			return nil, err
		}
		stream, err := s.loadEventStream(ctx, instance.ID, database.LogInstanceEventTypeConsume)
		if err != nil {
			return nil, err
		}
		disambiguations := make(map[string]int32)
		if datasetID, ok := s.lookupDatasetForRealm(ctx, instance.RealmID); ok {
			rows, err := s.db.ListConsumableDisambiguationsByDataset(ctx, datasetID)
			if err != nil {
				return nil, fmt.Errorf("list consumable disambiguations: %w", err)
			}
			for _, row := range rows {
				if row.ItemID.Valid {
					disambiguations[row.EffectKind+":"+strconv.Itoa(int(row.SpellID))] = row.ItemID.Int32
				}
			}
		}
		return buildConsumablesSummary(summaryCtx, stream, disambiguations)
	})
}

func buildConsumablesSummary(c *summaryContext, stream []byte, disambiguations map[string]int32) (*consumablesSummary, error) {
	night := newConsumableAccumulator()
	byPull := make(map[string]*consumableAccumulator)
	itemNames := make(map[int32]string)
	err := decodeEventSegments(stream, func(encounterID string, _ time.Time, message []byte) error {
		var event chronicleproto.Consume
		if err := proto.Unmarshal(message, &event); err != nil {
			return err
		}
		if event.ItemId != nil && event.GetItemName() != "" {
			itemNames[event.GetItemId()] = event.GetItemName()
		}
		night.add(&event)
		if _, ok := c.pullByID[encounterID]; ok {
			pull := byPull[encounterID]
			if pull == nil {
				pull = newConsumableAccumulator()
				byPull[encounterID] = pull
			}
			pull.add(&event)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("decode consume events: %w", err)
	}

	summary := &consumablesSummary{instance: c.instance, players: night.aggregate(c, disambiguations, itemNames)}
	for _, pull := range c.pulls {
		players := []PlayerConsumables{}
		if acc := byPull[pull.EncounterID.String()]; acc != nil {
			players = acc.aggregate(c, disambiguations, itemNames)
		}
		summary.pulls = append(summary.pulls, ConsumablePull{SummaryPull: pull, Players: players})
	}
	return summary, nil
}

func renderConsumables(summary *consumablesSummary, filter summaryFilter, links summaryLinks) any {
	linkPlayers := func(players []PlayerConsumables) []PlayerConsumables {
		out := make([]PlayerConsumables, len(players))
		for i, player := range players {
			player.Player = links.player(player.Player)
			out[i] = player
		}
		return out
	}
	response := ConsumablesResponse{
		Instance: links.instance(summary.instance),
		Pulls:    []ConsumablePull{},
		Players:  linkPlayers(summary.players),
	}
	for _, pull := range summary.pulls {
		if filter.match(pull.SummaryPull) {
			response.Pulls = append(response.Pulls, ConsumablePull{SummaryPull: pull.SummaryPull, Players: linkPlayers(pull.Players)})
		}
	}
	return response
}

func consumablesMarkdown(value any) string {
	response := value.(ConsumablesResponse)
	var b strings.Builder
	_, _ = fmt.Fprintf(&b, "# Consumables: %s\n\n", markdownLink(response.Instance.Name, response.Instance.URL))
	b.WriteString("Counts are physical uses. \"pre-pull\" means the buff was already active when the pull started.\n\n")
	writeTable := func(players []PlayerConsumables) {
		if len(players) == 0 {
			b.WriteString("No consumables recorded.\n\n")
			return
		}
		b.WriteString("| Player | Class | Uses | Consumables |\n|---|---|---|---|\n")
		for _, player := range players {
			_, _ = fmt.Fprintf(&b, "| %s | %s | %d | %s |\n", markdownLink(player.Player.Name, player.Player.URL),
				markdownCell.Replace(dashIfEmpty(player.Player.Class)), player.Total, markdownCell.Replace(consumableListText(player.Consumables)))
		}
		b.WriteString("\n")
	}
	for _, pull := range response.Pulls {
		_, _ = fmt.Fprintf(&b, "## %s, attempt %d (%s)\n\n", markdownCell.Replace(pull.Encounter), pull.Attempt, pull.Outcome)
		writeTable(pull.Players)
	}
	b.WriteString("## Whole instance\n\n")
	writeTable(response.Players)
	return b.String()
}

func consumableListText(counts []ConsumableCount) string {
	parts := make([]string, 0, len(counts))
	for _, count := range counts {
		text := count.Name
		if count.Count > 1 {
			text += fmt.Sprintf(" x%d", count.Count)
		}
		if count.ActiveAtPull > 0 {
			text += " (pre-pull)"
		}
		parts = append(parts, text)
	}
	return strings.Join(parts, ", ")
}

func (s *Service) getInstanceConsumables(w http.ResponseWriter, r *http.Request) {
	serveSummary(s, w, r, s.computeConsumablesSummary, renderConsumables, consumablesMarkdown)
}
