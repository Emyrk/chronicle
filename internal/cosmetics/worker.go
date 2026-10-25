package cosmetics

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindAuditUser = "cosmetics-audit-user"
	KindDispatch  = "cosmetics-dispatch-audits"
)

var uniqueStates = []rivertype.JobState{
	rivertype.JobStateScheduled,
	rivertype.JobStatePending,
	rivertype.JobStateAvailable,
	rivertype.JobStateRunning,
	rivertype.JobStateRetryable,
}

type ArgsAuditUser struct {
	UserID uuid.UUID `json:"user_id"`
}

func (ArgsAuditUser) Kind() string { return KindAuditUser }

func (ArgsAuditUser) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		MaxAttempts: 5,
		UniqueOpts: river.UniqueOpts{
			ByArgs:  true,
			ByState: uniqueStates,
		},
	}
}

type ArgsDispatchAudits struct{}

func (ArgsDispatchAudits) Kind() string { return KindDispatch }

func (ArgsDispatchAudits) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByState: uniqueStates,
		},
	}
}

type Authorizer interface {
	ListAllowedCosmetics(context.Context, uuid.UUID) ([]string, error)
}

type Store interface {
	GetUserCharacterCosmetics(context.Context, uuid.UUID) ([]database.UserCharacterCosmetic, error)
	UpdateUserCharacterActiveCosmetics(context.Context, database.UpdateUserCharacterActiveCosmeticsParams) (database.UserCharacterCosmetic, error)
	ListUsersWithCharacterCosmetics(context.Context) ([]uuid.UUID, error)
}

type JobInserter interface {
	Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

type WorkerAuditUser struct {
	river.WorkerDefaults[ArgsAuditUser]
	Store Store
	Authz Authorizer
}

type auditOutput struct {
	CharactersChecked int `json:"characters_checked"`
	CharactersChanged int `json:"characters_changed"`
}

func (w *WorkerAuditUser) Work(ctx context.Context, job *river.Job[ArgsAuditUser]) error {
	if job.Args.UserID == uuid.Nil {
		return river.JobCancel(fmt.Errorf("user ID is required"))
	}
	allowedIDs, err := w.Authz.ListAllowedCosmetics(ctx, job.Args.UserID)
	if err != nil {
		return fmt.Errorf("list allowed cosmetics: %w", err)
	}
	records, err := w.Store.GetUserCharacterCosmetics(ctx, job.Args.UserID)
	if err != nil {
		return fmt.Errorf("get user character cosmetics: %w", err)
	}
	output := auditOutput{CharactersChecked: len(records)}
	for _, record := range records {
		active := ActiveSelection(Selection{
			NameID:       record.RequestedNameID,
			BackgroundID: record.RequestedBackgroundID,
			BorderID:     record.RequestedBorderID,
		}, allowedIDs)
		if active.NameID == record.ActiveNameID && active.BackgroundID == record.ActiveBackgroundID && active.BorderID == record.ActiveBorderID {
			continue
		}
		if _, err := w.Store.UpdateUserCharacterActiveCosmetics(ctx, database.UpdateUserCharacterActiveCosmeticsParams{
			UserID:              job.Args.UserID,
			UserCharacterLinkID: record.UserCharacterLinkID,
			ActiveNameID:        active.NameID,
			ActiveBackgroundID:  active.BackgroundID,
			ActiveBorderID:      active.BorderID,
		}); err != nil {
			return fmt.Errorf("update active cosmetics for character link %s: %w", record.UserCharacterLinkID, err)
		}
		output.CharactersChanged++
	}
	_ = river.RecordOutput(ctx, output)
	return nil
}

type WorkerDispatchAudits struct {
	river.WorkerDefaults[ArgsDispatchAudits]
	Store Store
	Queue JobInserter
}

type dispatchOutput struct {
	UsersFound    int `json:"users_found"`
	UsersEnqueued int `json:"users_enqueued"`
}

func (w *WorkerDispatchAudits) Work(ctx context.Context, _ *river.Job[ArgsDispatchAudits]) error {
	users, err := w.Store.ListUsersWithCharacterCosmetics(ctx)
	if err != nil {
		return fmt.Errorf("list users with character cosmetics: %w", err)
	}
	output := dispatchOutput{UsersFound: len(users)}
	for _, userID := range users {
		if _, err := w.Queue.Insert(ctx, ArgsAuditUser{UserID: userID}, nil); err != nil {
			return fmt.Errorf("enqueue cosmetic audit for user %s: %w", userID, err)
		}
		output.UsersEnqueued++
	}
	_ = river.RecordOutput(ctx, output)
	return nil
}

func EnqueueUserAudit(ctx context.Context, queue JobInserter, userID uuid.UUID) error {
	if queue == nil || userID == uuid.Nil {
		return nil
	}
	_, err := queue.Insert(ctx, ArgsAuditUser{UserID: userID}, nil)
	return err
}
