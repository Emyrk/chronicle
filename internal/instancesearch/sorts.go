package instancesearch

import (
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

type sortDefinition struct {
	Option chroniclesdk.InstanceSearchSortOption
	Type   valueType
	Expr   func(*compiler, Sort) string
}

func scalarFieldSort(fieldName string) func(*compiler, Sort) string {
	return func(c *compiler, sort Sort) string {
		value := fieldsByName[fieldName].value(c, scope{kind: scopeInstance}, pred{parseScope: sort.ParseScope})
		if value.From != "" {
			panic("instance search sort requires a scalar field: " + fieldName)
		}
		return value.Expr
	}
}

var sortDefinitions = []*sortDefinition{
	{Option: sortOption(SortStartedAt, "Date", SortDesc, false, false, chroniclesdk.InstanceSearchSortTierFree, 0), Type: typeTime,
		Expr: func(*compiler, Sort) string { return "COALESCE(li.start_time, wlg.created_at)" }},
	{Option: sortOption(SortName, "Run", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierFree, 0), Type: typeString,
		Expr: func(*compiler, Sort) string {
			return "lower(COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name))"
		}},
	{Option: sortOption(SortRealm, "Realm", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierFree, 0), Type: typeString,
		Expr: func(*compiler, Sort) string { return "lower(wsr.name)" }},
	{Option: sortOption(SortGuild, "Guild", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierFree, 0), Type: typeString,
		Expr: func(*compiler, Sort) string { return "lower(g.name)" }},
	{Option: sortOption(SortDifficulty, "Difficulty", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierFree, 0), Type: typeString,
		Expr: func(*compiler, Sort) string { return "lower(li.difficulty_name)" }},
	{Option: sortOption(SortMaxPlayers, "Maximum players", SortDesc, false, false, chroniclesdk.InstanceSearchSortTierFree, 0), Type: typeInt,
		Expr: func(*compiler, Sort) string { return "li.max_players::bigint" }},
	{Option: sortOption(SortPlayerCount, "Players", SortDesc, false, false, chroniclesdk.InstanceSearchSortTierHonored, 8), Type: typeInt,
		Expr: func(*compiler, Sort) string {
			return "(SELECT count(DISTINCT sort_lp.unit_guid) FROM log_instance_players sort_lp WHERE sort_lp.instance_id = li.id)"
		}},
	{Option: sortOption(SortBossesKilled, "Bosses killed", SortDesc, false, false, chroniclesdk.InstanceSearchSortTierHonored, 4), Type: typeInt,
		Expr: func(*compiler, Sort) string {
			return "(SELECT count(DISTINCT sort_bk.name) FROM log_instance_encounters sort_bk WHERE sort_bk.instance_id = li.id AND sort_bk.boss AND sort_bk.kill_type " + killedSQL + ")"
		}},
	{Option: sortOption(SortDeaths, "Player deaths", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierRevered, 4), Type: typeInt,
		Expr: scalarFieldSort("instance.deaths")},
	{Option: sortOption(SortWipes, "Wipes", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierRevered, 4), Type: typeInt,
		Expr: scalarFieldSort("instance.wipes")},
	{Option: sortOption(SortClearTime, "Clear time", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierHonored, 4), Type: typeInt,
		Expr: func(*compiler, Sort) string {
			return "(SELECT sort_sr.ranked_duration_ms FROM instance_speedruns sort_sr WHERE sort_sr.instance_id = li.id AND sort_sr.ranked_duration_ms > 0)"
		}},
	{Option: sortOption(SortIdleTime, "Idle time", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierHonored, 20), Type: typeInt,
		Expr: scalarFieldSort("instance.idle_time_ms")},
	{Option: sortOption(SortBossTime, "Boss time", SortAsc, false, false, chroniclesdk.InstanceSearchSortTierHonored, 20), Type: typeInt,
		Expr: scalarFieldSort("instance.boss_time_ms")},
	{Option: sortOption(SortKillTime, "Boss kill time", SortAsc, false, true, chroniclesdk.InstanceSearchSortTierHonored, 6), Type: typeInt,
		Expr: func(c *compiler, sort Sort) string {
			e := c.alias("sort_kill")
			return fmt.Sprintf("(SELECT min(%[1]s) FROM log_instance_encounters %[2]s WHERE %[2]s.instance_id = li.id AND %[2]s.boss AND %[2]s.kill_type %[3]s AND lower(%[2]s.name) = lower(%[4]s::text))",
				durationMS(e), e, killedSQL, c.arg(sort.Boss))
		}},
}

func sortOption(field SortField, label string, direction SortDirection, parseScope, boss bool, tier chroniclesdk.InstanceSearchSortTier, cost int) chroniclesdk.InstanceSearchSortOption {
	return chroniclesdk.InstanceSearchSortOption{
		Field:            field,
		Label:            label,
		DefaultDirection: direction,
		ParseScope:       parseScope,
		Boss:             boss,
		MinimumTier:      tier,
		Cost:             cost,
	}
}

var sortDefinitionsByField = func() map[SortField]*sortDefinition {
	out := make(map[SortField]*sortDefinition, len(sortDefinitions))
	for _, definition := range sortDefinitions {
		if _, exists := out[definition.Option.Field]; exists {
			panic("duplicate instance search sort " + definition.Option.Field)
		}
		out[definition.Option.Field] = definition
	}
	return out
}()

func sortFieldsMessage() string {
	fields := make([]string, 0, len(sortDefinitions))
	for _, definition := range sortDefinitions {
		fields = append(fields, string(definition.Option.Field))
	}
	return "must be " + strings.Join(fields, ", ")
}

func DescribeSorts() []chroniclesdk.InstanceSearchSortOption {
	out := make([]chroniclesdk.InstanceSearchSortOption, 0, len(sortDefinitions))
	for _, definition := range sortDefinitions {
		out = append(out, definition.Option)
	}
	return out
}

func SortMinimumTier(field SortField) chroniclesdk.InstanceSearchSortTier {
	definition := sortDefinitionsByField[field]
	if definition == nil {
		return chroniclesdk.InstanceSearchSortTierRevered
	}
	return definition.Option.MinimumTier
}
