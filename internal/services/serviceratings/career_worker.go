package serviceratings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func CareerConfiguration(ctx context.Context, db database.Store, tenant uuid.UUID) (leaderboardconfig.CareerPool, error) {
	t, err := db.GetTenantByID(ctx, tenant)
	if err != nil {
		return leaderboardconfig.CareerPool{}, err
	}
	datasetID := servicedataset.DefaultDatasetID
	if t.DefaultDatasetID.Valid {
		datasetID = t.DefaultDatasetID.UUID
	}
	dataset, err := db.GetDataset(ctx, datasetID)
	if err != nil {
		return leaderboardconfig.CareerPool{}, err
	}
	return leaderboardconfig.ResolveCareer(ctx, db, tenant, database.FlavorFromStrings(dataset.DefaultFlavor), database.FlavorFromStrings(t.AdditionalFlavor))
}

type CareerWorker struct {
	Store   database.Store
	Metrics *Metrics
}

type careerPublication struct {
	identity database.LeaderboardCareerIdentity
	inputs   CareerInputs
	chosen   string
	encoded  json.RawMessage
}

// Drain publishes at most100 identities. It never holds a dirty-row lock during
// configuration/evidence computation, and newer revisions do not starve the tail.
func (w *CareerWorker) Drain(ctx context.Context, tenant uuid.UUID) (bool, error) {
	if servicetenant.IsBypass(ctx) {
		return false, fmt.Errorf("career drain requires tenant context")
	}
	ctx, cancel := context.WithTimeout(servicetenant.WithTenantID(ctx, tenant), WorkTimeout)
	defer cancel()
	claim, err := w.Store.ClaimLeaderboardCareer(ctx, tenant)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var pool leaderboardconfig.CareerPool
	var page []database.LeaderboardCareerIdentity
	var results []careerPublication
	published := false
	err = w.Store.InTx(ctx, func(tx database.Store) error {
		var err error
		pool, err = CareerConfiguration(ctx, tx, tenant)
		if err != nil {
			return err
		}
		page, err = tx.ListLeaderboardCareerIdentityPage(ctx, database.ListLeaderboardCareerIdentityPageParams{TenantID: tenant, AfterKind: claim.CursorKind, AfterRealm: claim.CursorRealm, AfterSubject: claim.CursorSubject, AfterClass: claim.CursorClass, AfterSpec: claim.CursorSpec, AfterSubSpec: claim.CursorSubSpec})
		if err != nil {
			return err
		}
		for _, id := range page {
			inputs, err := ComputeCareerInputs(ctx, tx, tenant, CareerIdentity{SubjectKind: id.SubjectKind, RealmID: id.RealmID, SubjectID: id.SubjectID, PlayerClass: id.PlayerClass, PlayerSpec: id.PlayerSpec, PlayerSubSpec: id.PlayerSubSpec}, pool)
			if err != nil {
				return err
			}
			chosen := ChooseCareerMetric(pool, inputs)
			if id.SubjectKind == "guild" {
				chosen = "kill_time"
			}
			encoded, err := json.Marshal(inputs)
			if err != nil {
				return err
			}
			results = append(results, careerPublication{id, inputs, chosen, encoded})
		}
		return nil
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err == nil {
		publishctx, stop := context.WithTimeout(ctx, PublicationTimeout)
		defer stop()
		err = w.Store.InTx(publishctx, func(tx database.Store) error {
			_, err := tx.LockLeaderboardCareerPublication(publishctx, database.LockLeaderboardCareerPublicationParams{TenantID: tenant, ClaimToken: claim.ClaimToken.UUID, ClaimedRevision: claim.ClaimedRevision.Int64})
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			published = true
			for _, result := range results {
				id := result.identity
				if len(result.inputs.Raids) == 0 && len(result.inputs.Kills) == 0 {
					err = tx.DeleteLeaderboardCareerSubject(publishctx, database.DeleteLeaderboardCareerSubjectParams{TenantID: tenant, SubjectKind: id.SubjectKind, RealmID: id.RealmID, SubjectID: id.SubjectID, PlayerClass: id.PlayerClass, PlayerSpec: id.PlayerSpec, PlayerSubSpec: id.PlayerSubSpec})
				} else {
					err = tx.UpsertLeaderboardCareerSubject(publishctx, database.UpsertLeaderboardCareerSubjectParams{TenantID: tenant, SubjectKind: id.SubjectKind, RealmID: id.RealmID, SubjectID: id.SubjectID, PlayerClass: id.PlayerClass, PlayerSpec: id.PlayerSpec, PlayerSubSpec: id.PlayerSubSpec, ChosenMetric: result.chosen, Inputs: result.encoded, PoolFingerprint: pool.Fingerprint})
				}
				if err != nil {
					return err
				}
			}
			if len(page) < BatchSize {
				return tx.CompleteLeaderboardCareer(publishctx, database.CompleteLeaderboardCareerParams{TenantID: tenant, ClaimToken: claim.ClaimToken.UUID, ClaimedRevision: claim.ClaimedRevision.Int64})
			}
			last := page[len(page)-1]
			return tx.AdvanceLeaderboardCareer(publishctx, database.AdvanceLeaderboardCareerParams{TenantID: tenant, ClaimToken: claim.ClaimToken.UUID, ClaimedRevision: claim.ClaimedRevision.Int64, CursorKind: last.SubjectKind, CursorRealm: last.RealmID, CursorSubject: last.SubjectID, CursorClass: last.PlayerClass, CursorSpec: last.PlayerSpec, CursorSubSpec: last.PlayerSubSpec})
		}, nil)
	}
	if err != nil {
		retryctx, stop := context.WithTimeout(context.WithoutCancel(ctx), PublicationTimeout)
		defer stop()
		retryerr := w.Store.FailLeaderboardCareer(retryctx, database.FailLeaderboardCareerParams{TenantID: tenant, ClaimToken: claim.ClaimToken.UUID, ClaimedRevision: claim.ClaimedRevision.Int64})
		if retryerr == nil {
			w.Metrics.event(tenant, "careers", "retry", "committed_attempt", 1)
		}
		return true, errors.Join(err, retryerr)
	}
	if published {
		w.Metrics.event(tenant, "careers", "publish", "committed", len(results))
	} else {
		w.Metrics.event(tenant, "careers", "publish", "fenced", 1)
	}
	return true, nil
}
