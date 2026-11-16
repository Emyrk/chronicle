package servicestats

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
)

// Most-worn gear among the top players of each class and spec, from the same
// aggregate as the gear trends page (database/queries/gear_trends.sql): each
// player's best boss-kill DPS in the window, the top gearTopN players, and the
// gear they wore in that kill. Precomputed nightly; a page hit reads one
// snapshot.
//
// Cost: one GearTrendsSlotItems query per class/spec pair with rankings in
// the window (about 25-30 pairs on a busy server), each scanning the tenant's
// listed raids once. Gear changes slowly, so a nightly run keeps pages a day
// fresh at a fraction of the gear trends page's per-request cost.

const (
	gearKey      = "gear"
	gearIndexKey = "gear-index"
	gearPrefix   = "/stats/gear"
	gearWindow   = 60 * 24 * time.Hour
	// gearTopN and gearMinSample match gear trends (gearbuilderapi/trends.go).
	gearTopN         = 20
	gearMinSample    = 5
	gearItemsPerSlot = 8
	gearCadence      = 24 * time.Hour
	gearTimeout      = 20 * time.Minute
)

// gearSlotOrder is the gear trends display order: paperdoll, weapons last.
// Shirt (3) and tabard (18) are cosmetic and left out.
var gearSlotOrder = []int32{0, 1, 2, 14, 4, 8, 9, 5, 6, 7, 10, 11, 12, 13, 15, 16, 17}

var gearSlotLabels = map[int32]string{
	0: "Head", 1: "Neck", 2: "Shoulder", 14: "Back", 4: "Chest", 8: "Wrist",
	9: "Hands", 5: "Waist", 6: "Legs", 7: "Feet", 10: "Finger 1", 11: "Finger 2",
	12: "Trinket 1", 13: "Trinket 2", 15: "Main Hand", 16: "Off Hand", 17: "Ranged",
}

type gearItem struct {
	ID      int32   `json:"id"`
	Name    string  `json:"name"`
	Wearers int32   `json:"wearers"`
	Percent float64 `json:"percent"`
}

type gearSlot struct {
	Slot  int32      `json:"slot"`
	Label string     `json:"label"`
	Items []gearItem `json:"items"`
}

type gearPayload struct {
	ClassName  string     `json:"class_name"` // "Death Knight"
	Spec       string     `json:"spec"`       // "Frost"
	WindowDays int        `json:"window_days"`
	TopN       int        `json:"top_n"`
	Players    int32      `json:"players"` // players in the cohort (≤ TopN)
	Slots      []gearSlot `json:"slots"`
}

type gearProducer struct {
	store database.Store
	now   func() time.Time
}

func (gearProducer) Key() string            { return gearKey }
func (gearProducer) Cadence() time.Duration { return gearCadence }
func (gearProducer) Timeout() time.Duration { return gearTimeout }

func (p gearProducer) Compute(ctx context.Context, _ Tenant) ([]Output, error) {
	since := timestamptz(p.now().Add(-gearWindow))
	cohorts, err := p.store.StatsGearCohorts(ctx, since)
	if err != nil {
		return nil, fmt.Errorf("list class/spec pairs: %w", err)
	}
	var outputs []Output
	seen := map[string]bool{}
	for _, c := range cohorts {
		classSlug, specSlug := gearSlug(c.PlayerClass), gearSlug(c.PlayerSpec)
		key := PageKey(gearKey, classSlug, specSlug)
		if classSlug == "" || specSlug == "" || seen[key] {
			continue
		}
		seen[key] = true
		rows, err := p.store.GearTrendsSlotItems(ctx, database.GearTrendsSlotItemsParams{
			PlayerClass: c.PlayerClass,
			PlayerSpec:  c.PlayerSpec,
			Since:       since,
			TopN:        gearTopN,
		})
		if err != nil {
			return nil, fmt.Errorf("gear for %s %s: %w", c.PlayerClass, c.PlayerSpec, err)
		}
		payload := assembleGear(className(c.PlayerClass), c.PlayerSpec, rows)
		if payload.Players == 0 {
			continue // no data: no page
		}
		outputs = append(outputs, Output{Key: key, Payload: payload, SampleN: int(payload.Players), MinSample: gearMinSample})
	}
	return outputs, nil
}

// assembleGear groups the per-slot rows (ordered by slot, then wearers) into
// display order, keeping the most-worn items of each slot.
func assembleGear(class, spec string, rows []database.GearTrendsSlotItemsRow) gearPayload {
	p := gearPayload{ClassName: class, Spec: spec, WindowDays: int(gearWindow.Hours() / 24), TopN: gearTopN, Slots: []gearSlot{}}
	if len(rows) == 0 {
		return p
	}
	p.Players = rows[0].CohortSize
	bySlot := map[int32][]gearItem{}
	for _, r := range rows {
		if len(bySlot[r.Slot]) >= gearItemsPerSlot || r.ItemName == "" {
			continue
		}
		bySlot[r.Slot] = append(bySlot[r.Slot], gearItem{
			ID: r.ItemID, Name: r.ItemName, Wearers: r.WearerCount,
			Percent: float64(r.WearerCount) / float64(p.Players) * 100,
		})
	}
	for _, slot := range gearSlotOrder {
		if items := bySlot[slot]; len(items) > 0 {
			p.Slots = append(p.Slots, gearSlot{Slot: slot, Label: gearSlotLabels[slot], Items: items})
		}
	}
	return p
}

// gearSlug turns a class or spec ("DEATH_KNIGHT", "Beast Mastery") into its
// URL segment ("death-knight", "beast-mastery").
func gearSlug(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			dash = false
			b.WriteRune(r)
			continue
		}
		if r != '\'' {
			dash = true
		}
	}
	return b.String()
}

// className turns a stored class ("DEATH_KNIGHT") into its display name.
func className(class string) string {
	words := strings.Fields(strings.ToLower(strings.ReplaceAll(class, "_", " ")))
	for i, w := range words {
		words[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	return strings.Join(words, " ")
}

// GearPath is a class/spec gear page.
func GearPath(class, spec string) string {
	return gearPrefix + "/" + gearSlug(class) + "/" + gearSlug(spec)
}

// gearSlotNouns name slots in the lead where the label alone reads badly.
var gearSlotNouns = map[int32]string{
	10: "ring", 11: "ring", 12: "trinket", 13: "trinket",
	15: "main-hand weapon", 16: "off-hand item", 17: "ranged weapon",
}

func slotNoun(s gearSlot) string {
	if noun, ok := gearSlotNouns[s.Slot]; ok {
		return noun
	}
	return strings.ToLower(s.Label)
}

func formatPercent(p float64) string {
	if p >= 10 {
		return fmt.Sprintf("%.0f%%", p)
	}
	return fmt.Sprintf("%.1f%%", p)
}

// leadSlot picks the slot the lead names: the one whose most-worn item is
// worn by the largest share, preferring single slots (not rings or trinkets)
// and earlier display order on ties.
func leadSlot(slots []gearSlot) (gearSlot, bool) {
	best, found := gearSlot{}, false
	numbered := func(s int32) bool { return s >= 10 && s <= 13 }
	for _, s := range slots {
		if len(s.Items) == 0 {
			continue
		}
		switch {
		case !found:
			best, found = s, true
		case numbered(best.Slot) && !numbered(s.Slot):
			best = s
		case numbered(best.Slot) == numbered(s.Slot) && s.Items[0].Wearers > best.Items[0].Wearers:
			best = s
		}
	}
	return best, found
}

// gearLead states the most-worn item in the lead slot, or that the sample is
// too small, from this server's own data.
func gearLead(label string, asOf time.Time, p gearPayload) string {
	date, who := FormatDate(asOf), p.Spec+" "+p.ClassName
	if p.Players < gearMinSample {
		return fmt.Sprintf("As of %s, only %s %s players on %s have boss-kill rankings in the last %d days, too few to show which gear they wear (Chronicle needs at least %d).",
			date, FormatInt(int64(p.Players)), who, label, p.WindowDays, gearMinSample)
	}
	slot, ok := leadSlot(p.Slots)
	if !ok {
		return fmt.Sprintf("As of %s, Chronicle has no recorded gear for the top %s %s players on %s in the last %d days.",
			date, FormatInt(int64(p.Players)), who, label, p.WindowDays)
	}
	top := slot.Items[0]
	return fmt.Sprintf("As of %s, %s is the most-worn %s among the top %s %s players on %s by boss-kill DPS in the last %d days, worn by %s of them (%s).",
		date, top.Name, slotNoun(slot), FormatInt(int64(p.Players)), who, label, p.WindowDays,
		FormatInt(int64(top.Wearers)), formatPercent(top.Percent))
}

func renderGear(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[gearPayload](snap)
	if err != nil {
		return Content{}, err
	}
	label := site.Label()
	lead := gearLead(label, snap.ComputedAt, p)
	c := Content{
		Title:       fmt.Sprintf("What gear do top %s %ss wear on %s?", p.Spec, p.ClassName, label),
		Description: lead,
		Lead:        lead,
		SampleLabel: "players",
		Window:      fmt.Sprintf("last %d days", p.WindowDays),
		Links: []Link{
			{Text: "Explore gear trends by raid and realm", Href: "/gear/trends"},
			{Text: "Most-worn gear for every class and spec", Href: gearPrefix},
			{Text: "Leaderboards", Href: "/leaderboards"},
		},
	}
	if p.Players < gearMinSample {
		return c, nil
	}
	c.Lead += " Each table lists the most-worn items in one slot. Gear is what players wore in their best kill, as recorded in uploaded logs."
	for _, slot := range p.Slots {
		rows := make([][]Cell, 0, len(slot.Items))
		for _, it := range slot.Items {
			rows = append(rows, []Cell{
				{Text: it.Name, Href: fmt.Sprintf("/wowdb/item?id=%d", it.ID)},
				{Text: formatPercent(it.Percent)},
				{Text: FormatInt(int64(it.Wearers))},
			})
		}
		c.Tables = append(c.Tables, Table{
			Caption: slot.Label,
			Headers: []string{"Item", "Share of top players", "Players"},
			Rows:    rows,
		})
	}
	return c, nil
}

func gearFamily(store database.Store, now func() time.Time) Family {
	return Family{Pattern: gearPrefix + "/{class}/{spec}", Producer: gearProducer{store: store, now: now}, Render: renderGear}
}

// The gear index lists the class/spec pages worth indexing. It reads the gear
// family's stored snapshot metadata, so it never repeats the gear query.

type gearIndexEntry struct {
	ClassName string `json:"class_name"`
	Spec      string `json:"spec"`
	Path      string `json:"path"`
	Players   int32  `json:"players"`
}

type gearIndexPayload struct {
	WindowDays int              `json:"window_days"`
	TopN       int              `json:"top_n"`
	Entries    []gearIndexEntry `json:"entries"`
}

type gearIndexProducer struct {
	store database.Store
}

func (gearIndexProducer) Key() string            { return gearIndexKey }
func (gearIndexProducer) Cadence() time.Duration { return time.Hour }
func (gearIndexProducer) Timeout() time.Duration { return 0 }

func (p gearIndexProducer) Compute(ctx context.Context, tenant Tenant) ([]Output, error) {
	meta, err := p.store.ListStatsSnapshotMeta(ctx, tenant.ID)
	if err != nil {
		return nil, err
	}
	payload := gearIndexPayload{WindowDays: int(gearWindow.Hours() / 24), TopN: gearTopN, Entries: []gearIndexEntry{}}
	for _, m := range meta {
		rest, ok := strings.CutPrefix(m.PageKey, gearKey+"/")
		if m.ProducerKey != gearKey || !ok || m.SampleN < m.MinSample {
			continue
		}
		class, spec, ok := strings.Cut(rest, "/")
		if !ok {
			continue
		}
		payload.Entries = append(payload.Entries, gearIndexEntry{
			ClassName: slugTitle(class), Spec: slugTitle(spec),
			Path: gearPrefix + "/" + class + "/" + spec, Players: m.SampleN,
		})
	}
	if len(payload.Entries) == 0 {
		return nil, nil // nothing indexable yet: no index page
	}
	sort.Slice(payload.Entries, func(i, j int) bool { return payload.Entries[i].Path < payload.Entries[j].Path })
	return []Output{{Key: gearIndexKey, Payload: payload, SampleN: len(payload.Entries), MinSample: 1}}, nil
}

// slugTitle turns a slug back into a display name ("beast-mastery" ->
// "Beast Mastery"); WoW class and spec names survive the round trip.
func slugTitle(slug string) string {
	return className(strings.ReplaceAll(slug, "-", " "))
}

func renderGearIndex(site Site, _ Page, snap Snapshot) (Content, error) {
	p, err := Decode[gearIndexPayload](snap)
	if err != nil {
		return Content{}, err
	}
	label := site.Label()
	lead := fmt.Sprintf("As of %s, Chronicle shows the most-worn gear for %s class and spec combinations on %s, each from the top %d players by boss-kill DPS in the last %d days.",
		FormatDate(snap.ComputedAt), FormatInt(int64(len(p.Entries))), label, p.TopN, p.WindowDays)
	rows := make([][]Cell, 0, len(p.Entries))
	for _, e := range p.Entries {
		rows = append(rows, []Cell{{Text: e.ClassName}, {Text: e.Spec, Href: e.Path}, {Text: FormatInt(int64(e.Players))}})
	}
	return Content{
		Title:       fmt.Sprintf("Most-worn gear by class and spec on %s", label),
		Description: lead,
		Lead:        lead + " Gear is what those players wore in their best kill, as recorded in uploaded logs.",
		SampleLabel: "class and spec pages",
		Window:      fmt.Sprintf("last %d days", p.WindowDays),
		Tables: []Table{{
			Caption: fmt.Sprintf("Gear pages for %s", label),
			Headers: []string{"Class", "Spec", "Players sampled"},
			Rows:    rows,
		}},
		Links: []Link{{Text: "Explore gear trends by raid and realm", Href: "/gear/trends"}},
	}, nil
}

func gearIndexFamily(store database.Store) Family {
	return Family{Pattern: gearPrefix, Producer: gearIndexProducer{store: store}, Render: renderGearIndex}
}
