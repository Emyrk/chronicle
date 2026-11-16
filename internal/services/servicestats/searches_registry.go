package servicestats

import (
	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// curatedSearch is one named search published as /stats/searches/{slug}. The
// queries are written for player demand ("fastest Molten Core clear",
// "deathless Ragnaros") and reuse the shapes in
// internal/instancesearch/testdata/examples. They name vanilla and Wrath raids;
// a tenant whose flavor does not register the raid in Requires is skipped, so
// no query runs and no empty page is stored.
type curatedSearch struct {
	Slug string
	// Title is the page's question; {server} becomes the site label.
	Title string
	// Answer is the lead's first sentence. Tokens: {server}, {value} (the top
	// result's value), {by} ("by <guild>" or "in a pickup raid"), {date} (when
	// the top run started).
	Answer string
	// About explains what the search finds.
	About string
	// Requires is an instance name the tenant's flavor must register ("" for any).
	Requires string
	// ValueHeader names the value column ("" for none). The value is the sort
	// property: a duration for clear, kill, idle and boss time, else a number.
	ValueHeader string
	Query       chroniclesdk.InstanceSearchQuery
}

// searchesShown is how many results each page lists.
const searchesShown = 25

func field(name string, op chroniclesdk.InstanceSearchOp, value any) chroniclesdk.InstanceSearchNode {
	return chroniclesdk.InstanceSearchNode{Field: name, Op: op, Value: value}
}

func and(nodes ...chroniclesdk.InstanceSearchNode) *chroniclesdk.InstanceSearchNode {
	return &chroniclesdk.InstanceSearchNode{And: nodes}
}

// fastestClears is "the fastest clears of <instance>": qualified full clears
// (the same rule as the speedrun leaderboard), quickest first.
func fastestClears(slug, instance, answerNoun string) curatedSearch {
	return curatedSearch{
		Slug:        slug,
		Title:       "Fastest " + instance + " clears on {server}",
		Answer:      "The fastest " + answerNoun + " clear on {server} is {value} {by}, set {date}.",
		About:       "Qualified full clears of " + instance + ", fastest first: the same clears the speedrun leaderboard ranks, but every run is listed, so a guild can appear more than once.",
		Requires:    instance,
		ValueHeader: "Clear time",
		Query: chroniclesdk.InstanceSearchQuery{
			Where: and(
				field("instance.name", chroniclesdk.InstanceSearchOpEq, instance),
				field("instance.clear_qualified", chroniclesdk.InstanceSearchOpEq, true),
				field("instance.clear_time_ms", chroniclesdk.InstanceSearchOpGt, 0),
			),
			Sort:  &chroniclesdk.InstanceSearchSort{Field: chroniclesdk.InstanceSearchSortClearTime, Direction: chroniclesdk.InstanceSearchSortAsc},
			Limit: searchesShown,
		},
	}
}

// curatedSearches is the registry, in the order the index lists it. The PR that
// added it explains why each entry is here.
var curatedSearches = []curatedSearch{
	fastestClears("fastest-molten-core-clears", "Molten Core", "Molten Core"),
	fastestClears("fastest-blackwing-lair-clears", "Blackwing Lair", "Blackwing Lair"),
	fastestClears("fastest-naxxramas-clears", "Naxxramas", "Naxxramas"),
	fastestClears("fastest-temple-of-ahn-qiraj-clears", "Temple of Ahn'Qiraj", "Temple of Ahn'Qiraj"),
	fastestClears("fastest-onyxias-lair-clears", "Onyxia's Lair", "Onyxia's Lair"),
	fastestClears("fastest-zul-gurub-clears", "Zul'Gurub", "Zul'Gurub"),
	fastestClears("fastest-ulduar-clears", "Ulduar", "Ulduar"),
	{
		Slug:        "fastest-ragnaros-kills",
		Title:       "Fastest Ragnaros kills on {server}",
		Answer:      "The fastest Ragnaros kill on {server} is {value} {by}, on {date}.",
		About:       "Runs ranked by their quickest Ragnaros kill, from the boss's first hit to its death.",
		Requires:    "Molten Core",
		ValueHeader: "Kill time",
		Query: chroniclesdk.InstanceSearchQuery{
			Where: and(
				field("instance.name", chroniclesdk.InstanceSearchOpEq, "Molten Core"),
				chroniclesdk.InstanceSearchNode{Field: "instance.kill_time_ms", Op: chroniclesdk.InstanceSearchOpGt, Value: 0, Bosses: []string{"Ragnaros"}},
			),
			Sort:  &chroniclesdk.InstanceSearchSort{Field: chroniclesdk.InstanceSearchSortKillTime, Direction: chroniclesdk.InstanceSearchSortAsc, Boss: "Ragnaros"},
			Limit: searchesShown,
		},
	},
	{
		Slug:     "deathless-ragnaros-kills",
		Title:    "Deathless Ragnaros kills on {server}",
		Answer:   "The most recent Ragnaros kill on {server} with no player deaths was {by} on {date}.",
		About:    "Runs that killed Ragnaros without a single player death on the kill, newest first.",
		Requires: "Molten Core",
		Query: chroniclesdk.InstanceSearchQuery{
			Where: and(
				chroniclesdk.InstanceSearchNode{Field: "instance.kill_time_ms", Op: chroniclesdk.InstanceSearchOpGt, Value: 0, Bosses: []string{"Ragnaros"}},
				chroniclesdk.InstanceSearchNode{Not: &chroniclesdk.InstanceSearchNode{AnyPlayer: &chroniclesdk.InstanceSearchNode{
					Field: "player.deaths", Op: chroniclesdk.InstanceSearchOpGte, Value: 1, Bosses: []string{"Ragnaros"},
				}}},
			),
			Limit: searchesShown,
		},
	},
	{
		Slug:     "ragnaros-one-pull-kills",
		Title:    "Ragnaros killed without a wipe on {server}",
		Answer:   "The most recent run on {server} that killed Ragnaros and never wiped on him was {by} on {date}.",
		About:    "Runs where Ragnaros died and the raid never wiped on him in the same run: a first-attempt kill.",
		Requires: "Molten Core",
		Query: chroniclesdk.InstanceSearchQuery{
			Where: and(
				chroniclesdk.InstanceSearchNode{AnyEncounter: and(
					field("encounter.name", chroniclesdk.InstanceSearchOpEq, "Ragnaros"),
					field("encounter.killed", chroniclesdk.InstanceSearchOpEq, true),
				)},
				chroniclesdk.InstanceSearchNode{Not: &chroniclesdk.InstanceSearchNode{AnyEncounter: and(
					field("encounter.name", chroniclesdk.InstanceSearchOpEq, "Ragnaros"),
					field("encounter.outcome", chroniclesdk.InstanceSearchOpEq, "wipe"),
				)}},
			),
			Limit: searchesShown,
		},
	},
	{
		Slug:     "small-group-molten-core-clears",
		Title:    "Small-group Molten Core and Onyxia runs on {server}",
		Answer:   "The most recent Molten Core or Onyxia's Lair run on {server} with 30 or fewer players was {by} on {date}.",
		About:    "Molten Core or Onyxia's Lair runs with 30 or fewer players: raids done with a short roster.",
		Requires: "Molten Core",
		Query: chroniclesdk.InstanceSearchQuery{
			Where: and(
				field("instance.name", chroniclesdk.InstanceSearchOpIn, []string{"Molten Core", "Onyxia's Lair"}),
				field("instance.player_count", chroniclesdk.InstanceSearchOpLte, 30),
				field("instance.bosses_killed", chroniclesdk.InstanceSearchOpGte, 1),
			),
			Limit: searchesShown,
		},
	},
	{
		Slug:        "tight-clears-low-downtime",
		Title:       "Tight raid clears with little downtime on {server}",
		Answer:      "The fastest clear on {server} with under 5 minutes of idle time is {value} {by}, set {date}.",
		About:       "Qualified full clears with under 5 minutes of idle time, fastest first: clears that kept moving.",
		ValueHeader: "Clear time",
		Query: chroniclesdk.InstanceSearchQuery{
			Where: and(
				field("instance.clear_qualified", chroniclesdk.InstanceSearchOpEq, true),
				field("instance.idle_time_ms", chroniclesdk.InstanceSearchOpLt, 300000),
			),
			Sort:  &chroniclesdk.InstanceSearchSort{Field: chroniclesdk.InstanceSearchSortClearTime, Direction: chroniclesdk.InstanceSearchSortAsc},
			Limit: searchesShown,
		},
	},
	{
		Slug:        "top-clears-on-the-server",
		Title:       "Top 5% raid clears on {server}",
		Answer:      "The fastest clear in the top 5% of {server}'s clear times is {value} {by}, set {date}.",
		About:       "Clears whose time parse is 95 or higher against every comparable clear on the server, fastest first.",
		ValueHeader: "Clear time",
		Query: chroniclesdk.InstanceSearchQuery{
			Where: and(
				chroniclesdk.InstanceSearchNode{Field: "instance.clear_parse", Op: chroniclesdk.InstanceSearchOpGte, Value: 95, ParseScope: chroniclesdk.InstanceSearchParseScopeServer},
				field("instance.clear_qualified", chroniclesdk.InstanceSearchOpEq, true),
			),
			Sort:  &chroniclesdk.InstanceSearchSort{Field: chroniclesdk.InstanceSearchSortClearTime, Direction: chroniclesdk.InstanceSearchSortAsc},
			Limit: searchesShown,
		},
	},
}
