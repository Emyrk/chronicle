package servicestats

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func TestAssembleGear(t *testing.T) {
	t.Parallel()
	rows := []database.GearTrendsSlotItemsRow{
		// Ordered by slot, then wearers, as the query returns them.
		{Slot: 0, ItemID: 12640, ItemName: "Lionheart Helm", WearerCount: 12, CohortSize: 20},
		{Slot: 3, ItemID: 2575, ItemName: "Red Linen Shirt", WearerCount: 9, CohortSize: 20},
		{Slot: 15, ItemID: 19364, ItemName: "Ashkandi, Greatsword of the Brotherhood", WearerCount: 9, CohortSize: 20},
		{Slot: 15, ItemID: 17076, ItemName: "Bonereaver's Edge", WearerCount: 5, CohortSize: 20},
		{Slot: 15, ItemID: 99999, ItemName: "", WearerCount: 1, CohortSize: 20},
	}
	p := assembleGear("Warrior", "Fury", rows)
	require.EqualValues(t, 20, p.Players)
	require.Equal(t, 60, p.WindowDays)
	require.Len(t, p.Slots, 2, "the shirt is cosmetic and left out")
	require.Equal(t, "Head", p.Slots[0].Label)
	require.Equal(t, "Main Hand", p.Slots[1].Label)
	require.Len(t, p.Slots[1].Items, 2, "unnamed items are skipped")
	require.InDelta(t, 45.0, p.Slots[1].Items[0].Percent, 0.001)

	many := make([]database.GearTrendsSlotItemsRow, 12)
	for i := range many {
		many[i] = database.GearTrendsSlotItemsRow{Slot: 12, ItemID: int32(i + 1), ItemName: "Trinket", WearerCount: 1, CohortSize: 20}
	}
	require.Len(t, assembleGear("Rogue", "Combat", many).Slots[0].Items, gearItemsPerSlot)
	require.Zero(t, assembleGear("Rogue", "Combat", nil).Players)
}

func TestGearSlugAndNames(t *testing.T) {
	t.Parallel()
	for in, want := range map[string]string{"DEATH_KNIGHT": "death-knight", "WARRIOR": "warrior", "Beast Mastery": "beast-mastery", "Fury": "fury", "": ""} {
		require.Equal(t, want, gearSlug(in), in)
	}
	require.Equal(t, "Death Knight", className("DEATH_KNIGHT"))
	require.Equal(t, "Beast Mastery", slugTitle("beast-mastery"))
	require.Equal(t, "/stats/gear/death-knight/frost", GearPath("DEATH_KNIGHT", "Frost"))
}

func TestGearLead(t *testing.T) {
	t.Parallel()
	asOf := time.Date(2026, 12, 12, 3, 0, 0, 0, time.UTC)
	p := gearPayload{ClassName: "Warrior", Spec: "Fury", WindowDays: 60, TopN: 20, Players: 20, Slots: []gearSlot{
		{Slot: 0, Label: "Head", Items: []gearItem{{Name: "Lionheart Helm", Wearers: 12, Percent: 60}}},
		{Slot: 12, Label: "Trinket 1", Items: []gearItem{{Name: "Diamond Flask", Wearers: 19, Percent: 95}}},
		{Slot: 15, Label: "Main Hand", Items: []gearItem{{Name: "Ashkandi", Wearers: 14, Percent: 70}}},
	}}
	require.Equal(t, "As of 2026-12-12, Ashkandi is the most-worn main-hand weapon among the top 20 Fury Warrior players on WoW Forever by boss-kill DPS in the last 60 days, worn by 14 of them (70%).",
		gearLead("WoW Forever", asOf, p), "the biggest single slot leads; rings and trinkets only when nothing else has data")

	trinketsOnly := p
	trinketsOnly.Slots = p.Slots[1:2]
	require.Contains(t, gearLead("WoW Forever", asOf, trinketsOnly), "Diamond Flask is the most-worn trinket among")

	other := p
	other.Players = 7
	other.Slots = []gearSlot{{Slot: 17, Label: "Ranged", Items: []gearItem{{Name: "Striker's Mark", Wearers: 3, Percent: 3.0 / 7 * 100}}}}
	otherLead := gearLead("Capybara (Turtle WoW fork)", asOf, other)
	require.Contains(t, otherLead, "Striker's Mark is the most-worn ranged weapon among the top 7 Fury Warrior players on Capybara (Turtle WoW fork)")
	require.Contains(t, otherLead, "(43%)")

	few := gearPayload{ClassName: "Priest", Spec: "Holy", WindowDays: 60, Players: 2}
	require.Equal(t, "As of 2026-12-12, only 2 Holy Priest players on WoW Forever have boss-kill rankings in the last 60 days, too few to show which gear they wear (Chronicle needs at least 5).",
		gearLead("WoW Forever", asOf, few))
}

func TestRenderGear(t *testing.T) {
	t.Parallel()
	snap := Snapshot{ComputedAt: time.Date(2026, 12, 12, 3, 0, 0, 0, time.UTC), Payload: []byte(`{
		"class_name": "Warrior", "spec": "Fury", "window_days": 60, "top_n": 20, "players": 20,
		"slots": [{"slot": 15, "label": "Main Hand", "items": [{"id": 19364, "name": "Ashkandi", "wearers": 14, "percent": 70}, {"id": 17076, "name": "Bonereaver's Edge", "wearers": 1, "percent": 5}]}]
	}`)}
	c, err := renderGear(Site{Name: "WoW Forever"}, Page{}, snap)
	require.NoError(t, err)
	require.Equal(t, "What gear do top Fury Warriors wear on WoW Forever?", c.Title)
	require.Len(t, c.Tables, 1)
	require.Equal(t, "Main Hand", c.Tables[0].Caption)
	require.Equal(t, []Cell{{Text: "Ashkandi", Href: "/wowdb/item?id=19364"}, {Text: "70%"}, {Text: "14"}}, c.Tables[0].Rows[0])
	require.Equal(t, "5.0%", c.Tables[0].Rows[1][1].Text)

	snap.Payload = []byte(`{"class_name": "Priest", "spec": "Holy", "window_days": 60, "top_n": 20, "players": 2, "slots": []}`)
	c, err = renderGear(Site{Name: "WoW Forever"}, Page{}, snap)
	require.NoError(t, err)
	require.Empty(t, c.Tables, "too few players: no tables")
	require.True(t, strings.HasPrefix(c.Lead, "As of 2026-12-12, only 2 Holy Priest players"))
}
