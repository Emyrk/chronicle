package serviceexternalapi

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"google.golang.org/protobuf/proto"
)

const (
	// deathRecapWindowMs matches the Deaths panel's inline recap (10 seconds).
	deathRecapWindowMs = 10_000
	// deathRecapEntries keeps the last few incoming damage and heal events.
	deathRecapEntries = 8
	// deathRecapMarkdownEntries keeps markdown table cells readable.
	deathRecapMarkdownEntries = 4
	// maxDeathsPerResponse bounds a response; later pulls keep their counts
	// but omit individual deaths. Use the encounter/attempt filters to page.
	maxDeathsPerResponse = 300
)

type DeathsResponse struct {
	Instance  SummaryInstance `json:"instance"`
	Pulls     []DeathPull     `json:"pulls"`
	Truncated bool            `json:"truncated,omitempty"`
}

type DeathPull struct {
	SummaryPull
	TotalDeaths int           `json:"total_deaths"`
	FirstDeath  *FirstDeath   `json:"first_death,omitempty"`
	Deaths      []PlayerDeath `json:"deaths"`
}

type FirstDeath struct {
	Player         string `json:"player"`
	TimeIntoPullMs int64  `json:"time_into_pull_ms"`
}

// PlayerDeath is one player death on a boss pull. Every slain event whose
// target is a player counts, as in the Deaths panel; the parser already
// replaces Feign Death with a spell event.
type PlayerDeath struct {
	TimeIntoPullMs int64         `json:"time_into_pull_ms"`
	At             time.Time     `json:"at"`
	Player         SummaryPlayer `json:"player"`
	Killer         string        `json:"killer"`
	KillingBlow    *KillingBlow  `json:"killing_blow,omitempty"`
	// Recap holds the last few damage and heal events the player received in
	// the 10 seconds before death, oldest first.
	Recap []DeathRecapEntry `json:"recap"`

	index int32
}

type KillingBlow struct {
	Ability  string `json:"ability"`
	SpellID  int32  `json:"spell_id,omitempty"`
	Source   string `json:"source"`
	Amount   int32  `json:"amount"`
	Overkill int32  `json:"overkill,omitempty"`
}

type DeathRecapEntry struct {
	TimeIntoPullMs int64  `json:"time_into_pull_ms"`
	Type           string `json:"type"`
	Ability        string `json:"ability"`
	Source         string `json:"source"`
	Amount         int32  `json:"amount"`
	Overkill       int32  `json:"overkill,omitempty"`
	Overheal       int32  `json:"overheal,omitempty"`

	index int32
}

// deathSummary is the cached, unfiltered result without request-specific URLs.
type deathSummary struct {
	instance SummaryInstance
	pulls    []DeathPull
}

func (s *Service) computeDeathSummary(ctx context.Context, instance database.LogInstancesGuild) (*deathSummary, error) {
	return s.deathCache.get(instance.ID, func() (*deathSummary, error) {
		summaryCtx, err := s.loadSummaryContext(ctx, instance)
		if err != nil {
			return nil, err
		}
		streams := make(map[database.LogInstanceEventType][]byte, 3)
		for _, kind := range []database.LogInstanceEventType{database.LogInstanceEventTypeSlain, database.LogInstanceEventTypeDamage, database.LogInstanceEventTypeHeal} {
			if streams[kind], err = s.loadEventStream(ctx, instance.ID, kind); err != nil {
				return nil, err
			}
		}
		return buildDeathSummary(summaryCtx, streams[database.LogInstanceEventTypeSlain], streams[database.LogInstanceEventTypeDamage], streams[database.LogInstanceEventTypeHeal])
	})
}

func buildDeathSummary(c *summaryContext, slainStream, damageStream, healStream []byte) (*deathSummary, error) {
	deathsByPull := make(map[string][]PlayerDeath)
	// deathKey -> death offsets, used to keep only recap-relevant events.
	deathOffsets := make(map[string][]int64)
	err := decodeEventSegments(slainStream, func(encounterID string, first time.Time, message []byte) error {
		if _, ok := c.pullByID[encounterID]; !ok {
			return nil
		}
		var slain chronicleproto.Slain
		if err := proto.Unmarshal(message, &slain); err != nil {
			return err
		}
		if !isPlayerGUID(slain.GetTarget()) {
			return nil
		}
		offset := slain.GetMeta().GetOffsetMilli()
		death := PlayerDeath{
			TimeIntoPullMs: offset,
			At:             first.Add(time.Duration(offset) * time.Millisecond),
			Player:         c.player(slain.GetTarget()),
			Killer:         c.unitName(slain.GetCaster()),
			Recap:          []DeathRecapEntry{},
			index:          slain.GetMeta().GetIndex(),
		}
		if attribution := slain.GetAttribution(); attribution != nil {
			source := attribution.GetCaster()
			if source == "" {
				source = slain.GetCaster()
			}
			death.KillingBlow = &KillingBlow{
				Ability:  attribution.GetSourceName(),
				SpellID:  attribution.GetSpellData().GetId(),
				Source:   c.unitName(source),
				Amount:   attribution.GetAmount(),
				Overkill: attribution.GetOverkill(),
			}
		}
		deathsByPull[encounterID] = append(deathsByPull[encounterID], death)
		key := encounterID + "|" + slain.GetTarget()
		deathOffsets[key] = append(deathOffsets[key], offset)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("decode slain events: %w", err)
	}

	// Recap candidates: incoming events within the window before any death of
	// the same player on the same pull.
	recaps := make(map[string][]DeathRecapEntry)
	keep := func(key string, offset int64) bool {
		for _, deathOffset := range deathOffsets[key] {
			if offset <= deathOffset && offset >= deathOffset-deathRecapWindowMs {
				return true
			}
		}
		return false
	}
	err = decodeEventSegments(damageStream, func(encounterID string, _ time.Time, message []byte) error {
		if _, ok := c.pullByID[encounterID]; !ok {
			return nil
		}
		var damage chronicleproto.Damage
		if err := proto.Unmarshal(message, &damage); err != nil {
			return err
		}
		key := encounterID + "|" + damage.GetTarget()
		if !keep(key, damage.GetMeta().GetOffsetMilli()) || !damageHasEffect(&damage) {
			return nil
		}
		recaps[key] = append(recaps[key], DeathRecapEntry{
			TimeIntoPullMs: damage.GetMeta().GetOffsetMilli(),
			Type:           "damage",
			Ability:        damage.GetSourceName(),
			Source:         c.unitName(damage.GetCaster()),
			Amount:         damage.GetAmount(),
			Overkill:       damage.GetOverkill(),
			index:          damage.GetMeta().GetIndex(),
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("decode damage events: %w", err)
	}
	err = decodeEventSegments(healStream, func(encounterID string, _ time.Time, message []byte) error {
		if _, ok := c.pullByID[encounterID]; !ok {
			return nil
		}
		var heal chronicleproto.Heal
		if err := proto.Unmarshal(message, &heal); err != nil {
			return err
		}
		key := encounterID + "|" + heal.GetTarget()
		if heal.GetAmount() <= 0 || !keep(key, heal.GetMeta().GetOffsetMilli()) {
			return nil
		}
		recaps[key] = append(recaps[key], DeathRecapEntry{
			TimeIntoPullMs: heal.GetMeta().GetOffsetMilli(),
			Type:           "heal",
			Ability:        heal.GetSourceName(),
			Source:         c.unitName(heal.GetCaster()),
			Amount:         heal.GetAmount(),
			Overheal:       heal.GetOverheal(),
			index:          heal.GetMeta().GetIndex(),
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("decode heal events: %w", err)
	}
	for key := range recaps {
		entries := recaps[key]
		sort.SliceStable(entries, func(i, j int) bool {
			return entries[i].TimeIntoPullMs < entries[j].TimeIntoPullMs ||
				(entries[i].TimeIntoPullMs == entries[j].TimeIntoPullMs && entries[i].index < entries[j].index)
		})
	}

	summary := &deathSummary{instance: c.instance, pulls: make([]DeathPull, 0, len(c.pulls))}
	for _, pull := range c.pulls {
		encounterID := pull.EncounterID.String()
		deaths := deathsByPull[encounterID]
		sort.SliceStable(deaths, func(i, j int) bool {
			return deaths[i].TimeIntoPullMs < deaths[j].TimeIntoPullMs ||
				(deaths[i].TimeIntoPullMs == deaths[j].TimeIntoPullMs && deaths[i].index < deaths[j].index)
		})
		for i := range deaths {
			deaths[i].Recap = deathRecap(recaps[encounterID+"|"+deaths[i].Player.GUID], deaths[i].TimeIntoPullMs)
		}
		out := DeathPull{SummaryPull: pull, TotalDeaths: len(deaths), Deaths: deaths}
		if out.Deaths == nil {
			out.Deaths = []PlayerDeath{}
		}
		if len(deaths) > 0 {
			out.FirstDeath = &FirstDeath{Player: deaths[0].Player.Name, TimeIntoPullMs: deaths[0].TimeIntoPullMs}
		}
		summary.pulls = append(summary.pulls, out)
	}
	return summary, nil
}

// mitigationHitTypes are the tailer flags the Deaths panel sums as resisted,
// blocked or absorbed damage.
const mitigationHitTypes = types.HitTypePartialResist | types.HitTypeFullResist |
	types.HitTypePartialBlock | types.HitTypeFullBlock |
	types.HitTypePartialAbsorb | types.HitTypeFullAbsorb

// damageHasEffect mirrors the panel: zero-damage events count only when a
// tailer shows resisted, blocked or absorbed damage.
func damageHasEffect(damage *chronicleproto.Damage) bool {
	if damage.GetAmount() != 0 {
		return true
	}
	for _, tailer := range damage.GetTailers() {
		if tailer.GetAmount() != 0 && types.HitType(tailer.GetHitType())&mitigationHitTypes != 0 {
			return true
		}
	}
	return false
}

func deathRecap(entries []DeathRecapEntry, deathOffset int64) []DeathRecapEntry {
	recap := make([]DeathRecapEntry, 0, deathRecapEntries)
	for _, entry := range entries {
		if entry.TimeIntoPullMs <= deathOffset && entry.TimeIntoPullMs >= deathOffset-deathRecapWindowMs {
			recap = append(recap, entry)
		}
	}
	if len(recap) > deathRecapEntries {
		recap = recap[len(recap)-deathRecapEntries:]
	}
	return recap
}

func renderDeaths(summary *deathSummary, filter summaryFilter, links summaryLinks) any {
	response := DeathsResponse{Instance: links.instance(summary.instance), Pulls: []DeathPull{}}
	included := 0
	for _, pull := range summary.pulls {
		if !filter.match(pull.SummaryPull) {
			continue
		}
		out := pull
		out.Deaths = make([]PlayerDeath, 0, len(pull.Deaths))
		if included+len(pull.Deaths) > maxDeathsPerResponse {
			response.Truncated = true
		} else {
			for _, death := range pull.Deaths {
				death.Player = links.player(death.Player)
				out.Deaths = append(out.Deaths, death)
			}
			included += len(pull.Deaths)
		}
		response.Pulls = append(response.Pulls, out)
	}
	return response
}

func deathsMarkdown(value any) string {
	response := value.(DeathsResponse)
	var b strings.Builder
	_, _ = fmt.Fprintf(&b, "# Deaths: %s\n\n", markdownLink(response.Instance.Name, response.Instance.URL))
	if len(response.Pulls) == 0 {
		b.WriteString("No boss pulls match.\n")
		return b.String()
	}
	for _, pull := range response.Pulls {
		_, _ = fmt.Fprintf(&b, "## %s, attempt %d (%s, %s)\n\n", markdownCell.Replace(pull.Encounter), pull.Attempt, pull.Outcome, formatPullTime(pull.DurationMs))
		if pull.TotalDeaths == 0 {
			b.WriteString("No player deaths.\n\n")
			continue
		}
		_, _ = fmt.Fprintf(&b, "%d deaths. First: %s at %s.\n\n", pull.TotalDeaths, markdownCell.Replace(pull.FirstDeath.Player), formatPullTime(pull.FirstDeath.TimeIntoPullMs))
		if len(pull.Deaths) == 0 {
			b.WriteString("Individual deaths omitted to bound the response; filter by encounter and attempt.\n\n")
			continue
		}
		b.WriteString("| Time | Player | Class | Role | Killing blow | Last hits before death |\n|---|---|---|---|---|---|\n")
		for _, death := range pull.Deaths {
			_, _ = fmt.Fprintf(&b, "| %s | %s | %s | %s | %s | %s |\n",
				formatPullTime(death.TimeIntoPullMs), markdownLink(death.Player.Name, death.Player.URL),
				markdownCell.Replace(dashIfEmpty(death.Player.Class)), markdownCell.Replace(dashIfEmpty(death.Player.Role)),
				markdownCell.Replace(killingBlowText(death)), markdownCell.Replace(recapText(death.Recap)))
		}
		b.WriteString("\n")
	}
	if response.Truncated {
		_, _ = fmt.Fprintf(&b, "Response truncated after %d deaths; filter by encounter and attempt for the rest.\n", maxDeathsPerResponse)
	}
	return b.String()
}

func killingBlowText(death PlayerDeath) string {
	if death.KillingBlow == nil {
		return "by " + death.Killer
	}
	text := fmt.Sprintf("%s %d by %s", death.KillingBlow.Ability, death.KillingBlow.Amount, death.KillingBlow.Source)
	if death.KillingBlow.Overkill > 0 {
		text += fmt.Sprintf(" (overkill %d)", death.KillingBlow.Overkill)
	}
	return text
}

func recapText(recap []DeathRecapEntry) string {
	if len(recap) == 0 {
		return "-"
	}
	if len(recap) > deathRecapMarkdownEntries {
		recap = recap[len(recap)-deathRecapMarkdownEntries:]
	}
	parts := make([]string, 0, len(recap))
	for _, entry := range recap {
		sign := "-"
		if entry.Type == "heal" {
			sign = "+"
		}
		parts = append(parts, fmt.Sprintf("%s %s%d (%s)", entry.Ability, sign, entry.Amount, entry.Source))
	}
	return strings.Join(parts, "; ")
}

func dashIfEmpty(value string) string {
	if value == "" {
		return "-"
	}
	return value
}

func (s *Service) getInstanceDeaths(w http.ResponseWriter, r *http.Request) {
	serveSummary(s, w, r, s.computeDeathSummary, renderDeaths, deathsMarkdown)
}
