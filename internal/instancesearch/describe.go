package instancesearch

import (
	"slices"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// Describe returns the field registry and limits for building search UIs.
func Describe() chroniclesdk.InstanceSearchFieldsResponse {
	out := chroniclesdk.InstanceSearchFieldsResponse{
		Fields:                 make([]chroniclesdk.InstanceSearchField, 0, len(fields)),
		MaxNodes:               DefaultMaxNodes,
		MaxDepth:               DefaultMaxDepth,
		AnonymousMaxPredicates: anonymousMaxPredicates,
		AnonymousMaxLimit:      anonymousMaxLimit,
		CostBase:               baseCost,
		CostOr:                 orCost,
		CostNot:                notCost,
		CostAny:                anyQuantCost,
		CostCount:              countQuantCost,
	}
	for _, f := range fields {
		cost := f.Cost
		if cost == 0 {
			cost = defaultFieldCost
		}
		out.Fields = append(out.Fields, chroniclesdk.InstanceSearchField{
			Name:       f.Name,
			Scope:      chroniclesdk.InstanceSearchFieldScope(f.Scope.String()),
			Type:       string(f.Type),
			Enum:       f.Enum,
			Ops:        f.Type.ops(),
			Unit:       f.Unit,
			Doc:        f.Doc,
			Bosses:     f.Bosses,
			ParseScope: f.ParseScope,
			Metric:     f.Metric,
			On:         f.On,
			Anonymous:  slices.Contains(AnonymousFields, f.Name),
			Cost:       cost,
		})
	}
	return out
}
