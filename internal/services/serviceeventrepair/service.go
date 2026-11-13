package serviceeventrepair

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Service struct {
	db         database.Store
	queue      *riverqueue.Queues
	evaluate   func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error)
	apply      func(context.Context, database.Store, *RazorgoreRepairPlan) error
	revalidate func(context.Context, database.Store, *RazorgoreRepairPlan) error
	lockSource func(context.Context, database.Store, uuid.UUID) error
}

func New(db database.Store, q *riverqueue.Queues) *Service {
	return &Service{db: db, queue: q, evaluate: EvaluateRazorgore, apply: ApplyRazorgore, revalidate: RevalidateRazorgore, lockSource: lockRepairSource}
}
func (s *Service) enqueue(ctx context.Context, tx database.Store, id uuid.UUID, phase string, actor uuid.UUID) error {
	if s.queue == nil || s.queue.Client == nil {
		return errors.New("event repair queue unavailable")
	}
	raw, ok := database.PGXTx(tx)
	if !ok {
		return errors.New("event repair enqueue requires transaction")
	}
	_, err := s.queue.InsertTx(ctx, raw, Args{OperationID: id, Phase: phase, RequestedBy: actor}, nil)
	return err
}
func lookupError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// successfulApply always publishes a durable canonical refresh, even if the
// evaluator's plan contains no changes. Source writes, old-identity repair,
// canonical enqueue and the audit checkpoint share one transaction.
func (s *Service) successfulApply(ctx context.Context, tx database.Store, id uuid.UUID, p *RazorgoreRepairPlan) error {
	if s.queue == nil || s.queue.Client == nil {
		return errors.New("event repair queue unavailable")
	}
	identities, err := tx.RankingRunIdentitiesByInstanceIDs(ctx, []uuid.UUID{id})
	if err != nil {
		return err
	}
	seeds := []uuid.UUID{id}
	for _, identity := range identities {
		seeds = append(seeds, identity.InstanceID, identity.RunID)
	}
	if err := serviceratings.EnqueueSourceRepairTx(ctx, tx, seeds); err != nil {
		return err
	}
	if err := s.apply(ctx, tx, p); err != nil {
		return err
	}
	return serviceratings.EnqueueCanonicalRefreshTx(ctx, tx, s.queue, seeds)
}

func operationDTO(row database.EventRepairOperation) (Operation, error) {
	o := Operation{ID: row.ID, Operation: row.Operation, Version: int(row.Version), State: row.State, CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time, CreatedBy: row.CreatedBy, TenantID: row.TenantID, Total: int(row.Total), Processed: int(row.Processed), Applied: int(row.Applied), Skipped: int(row.Skipped), LastError: row.LastError, Items: []Item{}}
	err := json.Unmarshal(row.Selection, &o.Selection)
	return o, err
}
func (s *Service) List(ctx context.Context) ([]Operation, error) {
	rows, err := s.db.ListAllEventRepairOperations(servicetenant.AdminBypass(ctx))
	if err != nil {
		return nil, err
	}
	result := make([]Operation, 0, len(rows))
	for _, row := range rows {
		o, err := operationDTO(row)
		if err != nil {
			return nil, err
		}
		result = append(result, o)
	}
	return result, nil
}
func (s *Service) Get(ctx context.Context, id uuid.UUID) (Operation, error) {
	ctx = servicetenant.AdminBypass(ctx)
	row, err := s.db.LookupEventRepairOperation(ctx, id)
	if err != nil {
		return Operation{}, lookupError(err)
	}
	o, err := operationDTO(row)
	if err != nil {
		return o, err
	}
	items, err := s.db.ListEventRepairItems(ctx, database.ListEventRepairItemsParams{OperationID: id, TenantID: row.TenantID, LimitCount: 1000})
	if err != nil {
		return o, err
	}
	for _, i := range items {
		item := Item{InstanceID: i.InstanceID, State: i.State, Reason: i.Reason, EvidenceHash: i.EvidenceHash, Changes: []string{}, RatingsQueued: i.State == "applied"}
		if err := json.Unmarshal(i.Changes, &item.Changes); err != nil {
			return o, err
		}
		o.Items = append(o.Items, item)
	}
	return o, nil
}
func (s *Service) Create(ctx context.Context, actor uuid.UUID, request CreateRequest) (Operation, error) {
	r, err := validateSelection(request)
	if err != nil {
		return Operation{}, err
	}
	ctx = servicetenant.AdminBypass(ctx)
	ids := []uuid.UUID{}
	if r.Instance != "" {
		target, err := s.db.ResolveEventRepairTarget(ctx, database.ResolveEventRepairTargetParams{TenantID: uuid.NullUUID{UUID: r.TenantID, Valid: r.TenantID != uuid.Nil}, Reference: r.Instance})
		if err != nil {
			return Operation{}, lookupError(err)
		}
		r.TenantID = target.TenantID.UUID
		ids = append(ids, target.InstanceID)
	} else {
		params := database.SelectEventRepairInstancesParams{TenantID: uuid.NullUUID{UUID: r.TenantID, Valid: true}, InstanceName: "Blackwing Lair", RealmID: uuid.NullUUID{UUID: r.RealmID, Valid: r.RealmID != uuid.Nil}, LimitCount: int32(r.Limit)}
		if r.After != nil {
			params.AfterDate = database.Timestamptz(*r.After)
		}
		if r.Before != nil {
			params.BeforeDate = database.Timestamptz(*r.Before)
		}
		rows, err := s.db.SelectEventRepairInstances(ctx, params)
		if err != nil {
			return Operation{}, err
		}
		for _, row := range rows {
			ids = append(ids, row.ID)
		}
	}
	id := uuid.New()
	selection, err := json.Marshal(r)
	if err != nil {
		return Operation{}, err
	}
	err = s.db.InTx(ctx, func(tx database.Store) error {
		_, err := tx.CreateEventRepairOperation(ctx, database.CreateEventRepairOperationParams{ID: id, Operation: r.Operation, Version: Version, CreatedBy: actor, TenantID: r.TenantID, Selection: selection, Total: int32(len(ids))})
		if err != nil {
			return err
		}
		for _, instance := range ids {
			if _, err := tx.InsertEventRepairItem(ctx, database.InsertEventRepairItemParams{OperationID: id, TenantID: r.TenantID, InstanceID: instance}); err != nil {
				return err
			}
		}
		return s.enqueue(ctx, tx, id, "dry_running", actor)
	}, nil)
	if err != nil {
		return Operation{}, err
	}
	return s.Get(ctx, id)
}
func (s *Service) Apply(ctx context.Context, id, actor uuid.UUID) (Operation, error) {
	ctx = servicetenant.AdminBypass(ctx)
	row, err := s.db.LookupEventRepairOperation(ctx, id)
	if err != nil {
		return Operation{}, lookupError(err)
	}
	err = s.db.InTx(ctx, func(tx database.Store) error {
		o, err := tx.LockEventRepairOperation(ctx, database.LockEventRepairOperationParams{ID: id, TenantID: row.TenantID})
		if err != nil {
			return err
		}
		if o.Version != Version || o.Operation != OperationRazorgore {
			return fmt.Errorf("%w: operation version no longer supported; create a new dry run", ErrConflict)
		}
		if o.State != "ready" && o.State != "applying" {
			return fmt.Errorf("%w: apply requires a ready report", ErrConflict)
		}
		if o.State == "ready" {
			if _, err := tx.RequestEventRepairApply(ctx, database.RequestEventRepairApplyParams{ID: id, TenantID: o.TenantID, AppliedBy: actor}); err != nil {
				return err
			}
		}
		return s.enqueue(ctx, tx, id, "applying", actor)
	}, nil)
	if err != nil {
		return Operation{}, err
	}
	return s.Get(ctx, id)
}
func (s *Service) Cancel(ctx context.Context, id, actor uuid.UUID) (Operation, error) {
	ctx = servicetenant.AdminBypass(ctx)
	row, err := s.db.LookupEventRepairOperation(ctx, id)
	if err != nil {
		return Operation{}, lookupError(err)
	}
	err = s.db.InTx(ctx, func(tx database.Store) error {
		o, err := tx.LockEventRepairOperation(ctx, database.LockEventRepairOperationParams{ID: id, TenantID: row.TenantID})
		if err != nil {
			return err
		}
		if o.State == "cancelled" {
			return nil
		}
		if o.State == "completed" {
			return fmt.Errorf("%w: completed operations cannot be cancelled", ErrConflict)
		}
		_, err = tx.CancelEventRepairOperation(ctx, database.CancelEventRepairOperationParams{ID: id, TenantID: o.TenantID, CancelledBy: actor})
		return err
	}, nil)
	if err != nil {
		return Operation{}, err
	}
	return s.Get(ctx, id)
}

// ProcessPage checkpoints each instance independently. A cancelled operation
// cannot race an apply: both acquire the operation row lock before source writes.
func (s *Service) ProcessPage(ctx context.Context, id uuid.UUID, phase string) (bool, error) {
	ctx = servicetenant.AdminBypass(ctx)
	op, err := s.db.LookupEventRepairOperation(ctx, id)
	if err != nil {
		return false, lookupError(err)
	}
	if op.State != phase || (phase != "dry_running" && phase != "applying") {
		return false, nil
	}
	state := "pending"
	if phase == "applying" {
		state = "ready"
	}
	rows, err := s.db.ListEventRepairPendingItems(ctx, database.ListEventRepairPendingItemsParams{OperationID: id, TenantID: op.TenantID, State: state})
	if err != nil {
		return false, err
	}
	// An empty selection still needs its durable final state checkpoint.
	if len(rows) == 0 {
		err = s.db.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockEventRepairOperation(ctx, database.LockEventRepairOperationParams{ID: id, TenantID: op.TenantID}); err != nil {
				return err
			}
			_, err := tx.RefreshEventRepairProgress(ctx, database.RefreshEventRepairProgressParams{ID: id, TenantID: op.TenantID})
			return err
		}, nil)
		return false, err
	}
	for _, item := range rows {
		err = s.processItem(ctx, op, item, phase)
		if err != nil {
			// Keep the instance pending/ready for River retry. Do not overwrite a
			// concurrent cancellation with the state observed before this attempt.
			cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			_ = s.db.InTx(cleanup, func(tx database.Store) error {
				current, e := tx.LockEventRepairOperation(cleanup, database.LockEventRepairOperationParams{ID: id, TenantID: op.TenantID})
				if e != nil {
					return e
				}
				_, e = tx.UpdateEventRepairOperationState(cleanup, database.UpdateEventRepairOperationStateParams{ID: id, TenantID: op.TenantID, State: current.State, LastError: err.Error()})
				return e
			}, nil)
			return false, err
		}
	}
	current, err := s.db.LookupEventRepairOperation(ctx, id)
	return err == nil && current.State == phase, err
}
func (s *Service) processItem(ctx context.Context, op database.EventRepairOperation, item database.EventRepairItem, phase string) error {
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	// Fetch, decompress and reconstruct before opening the short write transaction.
	plan, err := s.evaluate(ctx, s.db, item.InstanceID)
	if err != nil {
		return err
	}
	return s.db.InTx(ctx, func(tx database.Store) error {
		current, err := tx.LockEventRepairOperation(ctx, database.LockEventRepairOperationParams{ID: op.ID, TenantID: op.TenantID})
		if err != nil {
			return err
		}
		if current.State != phase {
			return nil
		}
		if current.Version != Version || current.Operation != OperationRazorgore {
			return fmt.Errorf("unsupported repair version")
		}
		stored, err := tx.LockEventRepairItem(ctx, database.LockEventRepairItemParams{OperationID: op.ID, TenantID: op.TenantID, InstanceID: item.InstanceID})
		if err != nil {
			return err
		}
		expected := "pending"
		if phase == "applying" {
			expected = "ready"
		}
		if stored.State != expected {
			return nil
		}
		// Match production source publication order: global canonical lock,
		// parse-generation row, then source/D1 publication. No decoding here.
		if err := s.lockSource(ctx, tx, item.InstanceID); err != nil {
			return err
		}
		changed := false
		if err := s.revalidate(ctx, tx, plan); err != nil {
			if !errors.Is(err, ErrStaleEvidence) || phase != "applying" {
				return err
			}
			changed = true
		}
		if plan.TenantID != op.TenantID {
			plan.RequiresReparse = true
			plan.Reason = "source is missing or no longer belongs to the selected tenant; original-log reparse or a new scoped operation is required"
		}
		state, reason := "ready", plan.Reason
		if plan.RequiresReparse {
			state = "skipped"
		}
		if phase == "applying" {
			if changed || plan.RequiresReparse || plan.EvidenceHash != stored.EvidenceHash {
				state = "stale"
				reason = "Evidence changed since dry run; create a new dry run. " + plan.Reason
			} else {
				if err := s.successfulApply(ctx, tx, item.InstanceID, plan); err != nil {
					return err
				}
				state = "applied"
			}
		}
		changes := plan.Changes
		if changes == nil {
			changes = []string{}
		}
		changeJSON, err := json.Marshal(changes)
		if err != nil {
			return err
		}
		planJSON, err := json.Marshal(plan)
		if err != nil {
			return err
		}
		evidenceHash := plan.EvidenceHash
		if phase == "applying" {
			// Retain exactly the preview the administrator approved, including
			// stale cases. Fresh evidence is evaluated, never substituted silently.
			evidenceHash, changeJSON, planJSON = stored.EvidenceHash, stored.Changes, stored.Plan
		}
		_, err = tx.UpdateEventRepairItem(ctx, database.UpdateEventRepairItemParams{OperationID: op.ID, TenantID: op.TenantID, InstanceID: item.InstanceID, State: state, Reason: reason, EvidenceHash: evidenceHash, Changes: changeJSON, Plan: planJSON})
		if err != nil {
			return err
		}
		_, err = tx.RefreshEventRepairProgress(ctx, database.RefreshEventRepairProgressParams{ID: op.ID, TenantID: op.TenantID})
		if err != nil {
			return err
		}
		// Clear transient retry diagnostics only after a committed checkpoint.
		refreshed, err := tx.GetEventRepairOperation(ctx, database.GetEventRepairOperationParams{ID: op.ID, TenantID: op.TenantID})
		if err != nil {
			return err
		}
		_, err = tx.UpdateEventRepairOperationState(ctx, database.UpdateEventRepairOperationStateParams{ID: op.ID, TenantID: op.TenantID, State: refreshed.State, LastError: ""})
		return err
	}, &pgx.TxOptions{IsoLevel: pgx.Serializable})
}

// Retry resumes only already-authorized work. It never turns a preview into an
// apply. The durable River job records the actor requesting this retry.
func (s *Service) Retry(ctx context.Context, id, actor uuid.UUID) (Operation, error) {
	ctx = servicetenant.AdminBypass(ctx)
	row, err := s.db.LookupEventRepairOperation(ctx, id)
	if err != nil {
		return Operation{}, lookupError(err)
	}
	err = s.db.InTx(ctx, func(tx database.Store) error {
		current, err := tx.LockEventRepairOperation(ctx, database.LockEventRepairOperationParams{ID: id, TenantID: row.TenantID})
		if err != nil {
			return err
		}
		if current.State != "dry_running" && current.State != "applying" {
			return fmt.Errorf("%w: only unfinished active work can be retried", ErrConflict)
		}
		if current.Version != Version || current.Operation != OperationRazorgore {
			return fmt.Errorf("%w: operation version no longer supported", ErrConflict)
		}
		return s.enqueue(ctx, tx, id, current.State, actor)
	}, nil)
	if err != nil {
		return Operation{}, err
	}
	return s.Get(ctx, id)
}

func lockRepairSource(ctx context.Context, tx database.Store, id uuid.UUID) error {
	if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
		return err
	}
	source, err := tx.RazorgoreRepairInstance(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	} // missing evidence is a terminal skip
	if err != nil {
		return err
	}
	_, err = tx.LockWoWLogGroupParseGeneration(ctx, source.LogGroupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrStaleEvidence
	}
	return err
}
