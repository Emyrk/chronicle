package servicerankings

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

type ratingGroupsQuerier interface {
	ListRatingRealmGroups(context.Context, uuid.UUID) ([]database.RatingRealmGroup, error)
	ListRatingRealmGroupMembers(context.Context, database.ListRatingRealmGroupMembersParams) ([]database.ListRatingRealmGroupMembersRow, error)
	ListRatingBossPolicies(context.Context, database.ListRatingBossPoliciesParams) ([]database.RatingGroupBossPolicy, error)
}

// handleRatingRealmGroupsWithStore retains the retired group response for legacy tests.
// The public ratings/groups route is no longer registered.
func handleRatingRealmGroupsWithStore(store ratingGroupsQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenant := servicetenant.TenantIDFromContext(ctx)
	groups, err := store.ListRatingRealmGroups(ctx, tenant)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := make([]chroniclesdk.RatingRealmGroup, 0, len(groups))
	for _, group := range groups {
		members, err := store.ListRatingRealmGroupMembers(ctx, database.ListRatingRealmGroupMembersParams{GroupID: group.ID, TenantID: tenant})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		bosses, err := store.ListRatingBossPolicies(ctx, database.ListRatingBossPoliciesParams{GroupID: group.ID, TenantID: tenant})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		item := chroniclesdk.RatingRealmGroup{
			ID: group.ID, ServerID: group.ServerID, Name: group.Name,
			Realms:         make([]chroniclesdk.RatingRealmGroupRealm, 0, len(members)),
			EligibleBosses: make([]chroniclesdk.RatingEligibleBoss, 0, len(bosses)),
		}
		for _, member := range members {
			item.Realms = append(item.Realms, chroniclesdk.RatingRealmGroupRealm{ID: member.ID, Name: member.Name})
		}
		for _, boss := range bosses {
			item.EligibleBosses = append(item.EligibleBosses, chroniclesdk.RatingEligibleBoss{
				InstanceName: boss.InstanceName, EncounterName: boss.EncounterName,
			})
		}
		out = append(out, item)
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.RatingRealmGroupsResponse{Groups: out})
}
