package api

import (
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/riverqueue/river/rivertype"
)

const ratingAdminBodyLimit = 16 << 10

var errRatingVersion = errors.New("rating policy version is stale")
var errRatingMissing = errors.New("rating group or policy not found")

func ratingAdminError(w http.ResponseWriter, r *http.Request, status int, message string) {
	httpapi.Write(r.Context(), w, status, chroniclesdk.Response{Message: message})
}
func ratingAdminDBError(w http.ResponseWriter, r *http.Request, err error) {
	var pgErr *pgconn.PgError
	switch {
	case errors.Is(err, errRatingVersion):
		ratingAdminError(w, r, http.StatusConflict, "Rating policy version is stale")
	case errors.Is(err, errRatingMissing), errors.Is(err, pgx.ErrNoRows):
		ratingAdminError(w, r, http.StatusNotFound, "Rating group or policy not found")
	case errors.As(err, &pgErr) && (pgErr.Code == "23505" || pgErr.Code == "23514" || pgErr.Code == "23503"):
		ratingAdminError(w, r, http.StatusConflict, "Rating configuration conflicts with existing data")
	case errors.As(err, &pgErr) && pgErr.Code == "40001":
		ratingAdminError(w, r, http.StatusConflict, "Rating configuration changed concurrently; retry")
	default:
		httpapi.InternalServerError(w, err)
	}
}
func ratingAdminID(w http.ResponseWriter, r *http.Request, key string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, key))
	if err != nil || id == uuid.Nil {
		ratingAdminError(w, r, http.StatusBadRequest, "Invalid "+key)
		return uuid.Nil, false
	}
	return id, true
}
func ratingAdminName(s string) bool { return s == strings.TrimSpace(s) && len(s) > 0 && len(s) <= 200 }
func ratingFinite(v float64) bool   { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func ratingAdminRead(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, ratingAdminBodyLimit)
	return httpapi.Read(r.Context(), w, r, v)
}
func (api *API) ratingAdminRebuild(r *http.Request) error {
	// The daily dispatcher also rebuilds ratings. Enqueue immediately on membership
	// or policy changes so an old active generation does not linger until then.
	if api.Queues == nil {
		return nil
	}
	_, err := api.Queues.Insert(r.Context(), servicerankings.ArgsRebuildTenantRatings{TenantID: servicetenant.TenantIDFromContext(r.Context())}, nil)
	if err != nil {
		// The mutation has already committed. Report success and let the daily
		// dispatcher repair freshness instead of claiming the write failed.
		slog.WarnContext(r.Context(), "rating rebuild enqueue failed; daily reconciliation will retry", slog.Any("error", err))
	}
	return nil
}

// adminRatingRoutes exposes only maintenance jobs. Rating configuration is
// migration-owned, so the legacy handlers below must not be registered here.
func (api *API) adminRatingRoutes(r chi.Router) {
	r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User))
	r.Post("/renown/repair", api.AdminDispatchRenownRepair)
	r.Post("/rebuild", api.AdminRebuildRatings)
}

// AdminDispatchRenownRepair starts a bounded historical repair pass across all
// tenants, including root. It does not wait for the repair pages to complete.
// For complete rating history, wait for the repair jobs to finish before
// calling /rebuild for the current tenant.
//
// POST /api/v1/admin/ratings/renown/repair (no request body)
func (api *API) AdminDispatchRenownRepair(w http.ResponseWriter, r *http.Request) {
	api.adminEnqueueRatingJob(w, r, servicerankings.ArgsDispatchRenownRepair{})
}

// AdminRebuildRatings rebuilds only the tenant resolved from the request host.
// It does not dispatch an all-tenant rating rebuild or wait for Renown repairs.
//
// POST /api/v1/admin/ratings/rebuild (no request body)
func (api *API) AdminRebuildRatings(w http.ResponseWriter, r *http.Request) {
	api.adminEnqueueRatingJob(w, r, servicerankings.ArgsRebuildTenantRatings{TenantID: servicetenant.TenantIDFromContext(r.Context())})
}

func (api *API) adminEnqueueRatingJob(w http.ResponseWriter, r *http.Request, args rivertype.JobArgs) {
	ctx := r.Context()
	if api.Queues == nil || api.Queues.Client == nil {
		ratingAdminError(w, r, http.StatusServiceUnavailable, "Ranking queue is unavailable")
		return
	}
	result, err := api.Queues.Insert(ctx, args, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.AdminRatingJobResponse{
		JobID:                    result.Job.ID,
		JobState:                 string(result.Job.State),
		UniqueSkippedAsDuplicate: result.UniqueSkippedAsDuplicate,
	})
}

// Legacy group configuration handlers below are no longer registered as HTTP
// routes. Keep them while the group-based database logic is being migrated.
func (api *API) AdminListRatingGroups(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenant := servicetenant.TenantIDFromContext(ctx)
	db := database.New(api.Opts.Pool)
	groups, err := db.ListRatingRealmGroups(ctx, tenant)
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	out := make([]chroniclesdk.AdminRatingGroup, 0, len(groups))
	for _, g := range groups {
		members, err := db.ListRatingRealmGroupMembers(ctx, database.ListRatingRealmGroupMembersParams{TenantID: tenant, GroupID: g.ID})
		if err != nil {
			ratingAdminDBError(w, r, err)
			return
		}
		item := chroniclesdk.AdminRatingGroup{ID: g.ID, ServerID: g.ServerID, Name: g.Name, Realms: make([]chroniclesdk.RatingRealmGroupRealm, 0, len(members))}
		for _, m := range members {
			item.Realms = append(item.Realms, chroniclesdk.RatingRealmGroupRealm{ID: m.ID, Name: m.Name})
		}
		out = append(out, item)
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminRatingGroupsResponse{Groups: out})
}
func (api *API) AdminCreateRatingGroup(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.AdminCreateRatingGroupRequest
	if !ratingAdminRead(w, r, &req) {
		return
	}
	if req.ServerID == uuid.Nil || !ratingAdminName(req.Name) {
		ratingAdminError(w, r, http.StatusBadRequest, "Valid server_id and group name are required")
		return
	}
	ctx := r.Context()
	g, err := database.New(api.Opts.Pool).CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: req.ServerID, Name: req.Name, TenantID: servicetenant.TenantIDFromContext(ctx)})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.AdminRatingGroup{ID: g.ID, ServerID: g.ServerID, Name: g.Name, Realms: []chroniclesdk.RatingRealmGroupRealm{}})
}
func (api *API) AdminRenameRatingGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	var req chroniclesdk.AdminRenameRatingGroupRequest
	if !ratingAdminRead(w, r, &req) {
		return
	}
	if !ratingAdminName(req.Name) {
		ratingAdminError(w, r, http.StatusBadRequest, "Valid group name is required")
		return
	}
	n, err := database.New(api.Opts.Pool).RenameRatingRealmGroup(r.Context(), database.RenameRatingRealmGroupParams{GroupID: id, TenantID: servicetenant.TenantIDFromContext(r.Context()), Name: req.Name})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if n == 0 {
		ratingAdminDBError(w, r, errRatingMissing)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (api *API) AdminDeleteRatingGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	n, err := database.New(api.Opts.Pool).DeleteRatingRealmGroup(r.Context(), database.DeleteRatingRealmGroupParams{GroupID: id, TenantID: servicetenant.TenantIDFromContext(r.Context())})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if n == 0 {
		ratingAdminDBError(w, r, errRatingMissing)
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (api *API) AdminAssignRatingRealm(w http.ResponseWriter, r *http.Request) {
	group, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	realm, ok := ratingAdminID(w, r, "realmID")
	if !ok {
		return
	}
	n, err := database.New(api.Opts.Pool).AssignRatingRealmToGroup(r.Context(), database.AssignRatingRealmToGroupParams{GroupID: group, RealmID: realm, TenantID: servicetenant.TenantIDFromContext(r.Context())})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if n == 0 {
		ratingAdminDBError(w, r, errRatingMissing)
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (api *API) AdminUnassignRatingRealm(w http.ResponseWriter, r *http.Request) {
	realm, ok := ratingAdminID(w, r, "realmID")
	if !ok {
		return
	}
	n, err := database.New(api.Opts.Pool).UnassignRatingRealmFromGroup(r.Context(), database.UnassignRatingRealmFromGroupParams{RealmID: realm, TenantID: servicetenant.TenantIDFromContext(r.Context())})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if n == 0 {
		ratingAdminDBError(w, r, errRatingMissing)
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func ratingPolicyResponse(p database.RatingGroupPolicy) chroniclesdk.AdminRatingGroupPolicy {
	return chroniclesdk.AdminRatingGroupPolicy{GroupID: p.GroupID, Version: p.Version, PeriodDays: p.PeriodDays, HalfLifeDays: p.HalfLifeDays, BestWeight: p.BestWeight, FormWeight: p.FormWeight, FloorWeight: p.FloorWeight, RankOneWeight: p.RankOneWeight, FullRankKills: p.FullRankKills}
}
func (api *API) AdminListRatingPolicies(w http.ResponseWriter, r *http.Request) {
	policies, err := database.New(api.Opts.Pool).ListTenantRatingPolicies(r.Context(), servicetenant.TenantIDFromContext(r.Context()))
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	out := make([]chroniclesdk.AdminRatingGroupPolicy, 0, len(policies))
	for _, p := range policies {
		out = append(out, ratingPolicyResponse(p))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.AdminRatingPoliciesResponse{Policies: out})
}
func validRatingPolicy(p chroniclesdk.AdminPutRatingGroupPolicyRequest) bool {
	return p.Version > 0 && p.PeriodDays > 0 && p.PeriodDays <= 3650 && p.FullRankKills > 0 && p.FullRankKills <= 10000 && ratingFinite(p.HalfLifeDays) && p.HalfLifeDays > 0 && p.HalfLifeDays <= 3650 &&
		ratingFinite(p.BestWeight) && p.BestWeight >= 0 && ratingFinite(p.FormWeight) && p.FormWeight >= 0 &&
		ratingFinite(p.FloorWeight) && p.FloorWeight >= 0 && math.Abs(p.BestWeight+p.FormWeight+p.FloorWeight-1) < 1e-9 &&
		ratingFinite(p.RankOneWeight) && p.RankOneWeight >= 0 && p.RankOneWeight <= 1
}
func (api *API) AdminPutRatingPolicy(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	var req chroniclesdk.AdminPutRatingGroupPolicyRequest
	if !ratingAdminRead(w, r, &req) {
		return
	}
	if !validRatingPolicy(req) {
		ratingAdminError(w, r, http.StatusBadRequest, "Invalid rating policy: positive duration and kills, finite nonnegative weights summing to one, and rank_one_weight in [0,1] are required")
		return
	}
	n, err := database.New(api.Opts.Pool).PutRatingGroupPolicy(r.Context(), database.PutRatingGroupPolicyParams{GroupID: id, TenantID: servicetenant.TenantIDFromContext(r.Context()), Version: req.Version, PeriodDays: req.PeriodDays, HalfLifeDays: req.HalfLifeDays, BestWeight: req.BestWeight, FormWeight: req.FormWeight, FloorWeight: req.FloorWeight, RankOneWeight: req.RankOneWeight, FullRankKills: req.FullRankKills})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if n == 0 {
		groups, e := database.New(api.Opts.Pool).ListRatingRealmGroups(r.Context(), servicetenant.TenantIDFromContext(r.Context()))
		if e != nil {
			ratingAdminDBError(w, r, e)
			return
		}
		found := false
		for _, g := range groups {
			if g.ID == id {
				found = true
				break
			}
		}
		if found {
			ratingAdminDBError(w, r, errRatingVersion)
		} else {
			ratingAdminDBError(w, r, errRatingMissing)
		}
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}

// AdminListRatingRaidPolicies returns explicit instance-level weights for one group.
func (api *API) AdminListRatingRaidPolicies(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	ctx := r.Context()
	raids, err := database.New(api.Opts.Pool).ListRatingRaidPolicies(ctx, database.ListRatingRaidPoliciesParams{GroupID: id, TenantID: servicetenant.TenantIDFromContext(ctx)})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	out := make([]chroniclesdk.AdminRatingRaidPolicy, 0, len(raids))
	for _, raid := range raids {
		out = append(out, chroniclesdk.AdminRatingRaidPolicy{GroupID: raid.GroupID, InstanceName: raid.InstanceName, PeakWeight: raid.PeakWeight, MasteryWeight: raid.MasteryWeight})
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminRatingRaidPoliciesResponse{Raids: out})
}

func validRatingRaidPolicy(req chroniclesdk.AdminPutRatingRaidPolicyRequest) bool {
	return req.ExpectedVersion > 0 && ratingAdminName(req.InstanceName) &&
		ratingFinite(req.PeakWeight) && req.PeakWeight > 0 &&
		ratingFinite(req.MasteryWeight) && req.MasteryWeight > 0
}

// AdminPutRatingRaidPolicy creates or updates explicit raid weights. A policy
// version bump is performed by the database trigger after the write.
func (api *API) AdminPutRatingRaidPolicy(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	var req chroniclesdk.AdminPutRatingRaidPolicyRequest
	if !ratingAdminRead(w, r, &req) {
		return
	}
	if !validRatingRaidPolicy(req) {
		ratingAdminError(w, r, http.StatusBadRequest, "Valid expected_version, instance_name, and finite positive weights are required")
		return
	}
	ctx := r.Context()
	db := database.New(api.Opts.Pool)
	err := db.InTx(ctx, func(tx database.Store) error {
		if err := ratingBossVersion(tx, r, id, req.ExpectedVersion); err != nil {
			return err
		}
		n, err := tx.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
			GroupID: id, TenantID: servicetenant.TenantIDFromContext(ctx),
			InstanceName: req.InstanceName, PeakWeight: req.PeakWeight, MasteryWeight: req.MasteryWeight,
		})
		if err != nil {
			return err
		}
		if n == 0 {
			return errRatingMissing
		}
		return nil
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

// AdminDeleteRatingRaidPolicy removes an explicit raid's weights.
func (api *API) AdminDeleteRatingRaidPolicy(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	var req chroniclesdk.AdminDeleteRatingRaidPolicyRequest
	if !ratingAdminRead(w, r, &req) {
		return
	}
	if req.ExpectedVersion <= 0 || !ratingAdminName(req.InstanceName) {
		ratingAdminError(w, r, http.StatusBadRequest, "Valid expected_version and instance_name are required")
		return
	}
	ctx := r.Context()
	db := database.New(api.Opts.Pool)
	err := db.InTx(ctx, func(tx database.Store) error {
		if err := ratingBossVersion(tx, r, id, req.ExpectedVersion); err != nil {
			return err
		}
		n, err := tx.DeleteRatingRaidPolicy(ctx, database.DeleteRatingRaidPolicyParams{
			GroupID: id, TenantID: servicetenant.TenantIDFromContext(ctx), InstanceName: req.InstanceName,
		})
		if err != nil {
			return err
		}
		if n == 0 {
			return errRatingMissing
		}
		return nil
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) AdminListRatingBossPolicies(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	ctx := r.Context()
	bosses, err := database.New(api.Opts.Pool).ListRatingBossPolicies(ctx, database.ListRatingBossPoliciesParams{TenantID: servicetenant.TenantIDFromContext(ctx), GroupID: id})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	out := make([]chroniclesdk.AdminRatingBossPolicy, 0, len(bosses))
	for _, b := range bosses {
		out = append(out, chroniclesdk.AdminRatingBossPolicy{GroupID: b.GroupID, InstanceName: b.InstanceName, EncounterName: b.EncounterName, PeakWeight: b.PeakWeight, MasteryWeight: b.MasteryWeight, RenownPoints: b.RenownPoints})
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminRatingBossPoliciesResponse{Bosses: out})
}
func ratingBossName(s string) bool { return ratingAdminName(s) }
func ratingBossVersion(db database.Store, r *http.Request, group uuid.UUID, expected int32) error {
	if expected <= 0 {
		return errRatingVersion
	}
	policies, err := db.ListTenantRatingPolicies(r.Context(), servicetenant.TenantIDFromContext(r.Context()))
	if err != nil {
		return err
	}
	for _, p := range policies {
		if p.GroupID == group {
			if p.Version != expected {
				return errRatingVersion
			}
			return nil
		}
	}
	return errRatingMissing
}
func (api *API) AdminPutRatingBossPolicy(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	var req chroniclesdk.AdminPutRatingBossPolicyRequest
	if !ratingAdminRead(w, r, &req) {
		return
	}
	if req.ExpectedVersion <= 0 || !ratingBossName(req.InstanceName) || !ratingBossName(req.EncounterName) || !ratingFinite(req.PeakWeight) || req.PeakWeight <= 0 || !ratingFinite(req.MasteryWeight) || req.MasteryWeight <= 0 || !ratingFinite(req.RenownPoints) || req.RenownPoints < 0 {
		ratingAdminError(w, r, http.StatusBadRequest, "Invalid boss policy, expected_version, names, weights, or points")
		return
	}
	ctx := r.Context()
	db := database.New(api.Opts.Pool)
	err := db.InTx(ctx, func(tx database.Store) error {
		if err := ratingBossVersion(tx, r, id, req.ExpectedVersion); err != nil {
			return err
		}
		n, err := tx.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{GroupID: id, TenantID: servicetenant.TenantIDFromContext(ctx), InstanceName: req.InstanceName, EncounterName: req.EncounterName, PeakWeight: req.PeakWeight, MasteryWeight: req.MasteryWeight, RenownPoints: req.RenownPoints})
		if err != nil {
			return err
		}
		if n == 0 {
			return errRatingMissing
		}
		return nil
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}
func (api *API) AdminDeleteRatingBossPolicy(w http.ResponseWriter, r *http.Request) {
	id, ok := ratingAdminID(w, r, "groupID")
	if !ok {
		return
	}
	var req chroniclesdk.AdminDeleteRatingBossPolicyRequest
	if !ratingAdminRead(w, r, &req) {
		return
	}
	if req.ExpectedVersion <= 0 || !ratingBossName(req.InstanceName) || !ratingBossName(req.EncounterName) {
		ratingAdminError(w, r, http.StatusBadRequest, "Valid expected_version and boss names are required")
		return
	}
	ctx := r.Context()
	db := database.New(api.Opts.Pool)
	err := db.InTx(ctx, func(tx database.Store) error {
		if err := ratingBossVersion(tx, r, id, req.ExpectedVersion); err != nil {
			return err
		}
		n, err := tx.DeleteRatingBossPolicy(ctx, database.DeleteRatingBossPolicyParams{GroupID: id, TenantID: servicetenant.TenantIDFromContext(ctx), InstanceName: req.InstanceName, EncounterName: req.EncounterName})
		if err != nil {
			return err
		}
		if n == 0 {
			return errRatingMissing
		}
		return nil
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	if err = api.ratingAdminRebuild(r); err != nil {
		ratingAdminDBError(w, r, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}
