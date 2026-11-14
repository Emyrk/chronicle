package serviceblog

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

type databaseStore struct{ db database.Store }

func NewDatabaseStore(db database.Store) Store { return &databaseStore{db: db} }
func feedback(row database.BlogFeedback) Feedback {
	return Feedback{ID: row.ID, PostSlug: row.PostSlug, UserID: row.UserID, TenantID: row.OriginalTenantID.UUID, Body: row.Body.String, Consent: row.PublicConsent, Status: row.Status, Deleted: row.DeletedAt.Valid, UpdatedAt: row.UpdatedAt.Time}
}
func (d *databaseStore) Votes(ctx context.Context, slug string, user uuid.UUID) (Votes, error) {
	row, err := d.db.GetBlogVoteTotals(ctx, slug)
	if err != nil {
		return Votes{}, err
	}
	out := Votes{Up: row.Upvotes, Down: row.Downvotes}
	if user != uuid.Nil {
		vote, err := d.db.GetBlogVote(ctx, database.GetBlogVoteParams{PostSlug: slug, UserID: user})
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return out, err
		}
		if err == nil {
			out.Own = vote.Value
		}
	}
	return out, nil
}
func (d *databaseStore) SetVote(ctx context.Context, slug string, user uuid.UUID, value int16) error {
	if value == 0 {
		return d.db.DeleteBlogVote(ctx, database.DeleteBlogVoteParams{PostSlug: slug, UserID: user})
	}
	_, err := d.db.UpsertBlogVote(ctx, database.UpsertBlogVoteParams{PostSlug: slug, UserID: user, Value: value})
	return err
}
func (d *databaseStore) OwnFeedback(ctx context.Context, slug string, user uuid.UUID) (*Feedback, error) {
	row, err := d.db.GetBlogFeedback(ctx, database.GetBlogFeedbackParams{PostSlug: slug, UserID: user})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	f := feedback(row)
	return &f, nil
}
func (d *databaseStore) SaveFeedback(ctx context.Context, f Feedback) (Feedback, bool, error) {
	own, err := d.OwnFeedback(ctx, f.PostSlug, f.UserID)
	if err != nil {
		return Feedback{}, false, err
	}
	if own != nil {
		if own.Deleted {
			return Feedback{}, false, ErrReserved
		}
		row, err := d.db.UpdateBlogFeedback(ctx, database.UpdateBlogFeedbackParams{PostSlug: f.PostSlug, UserID: f.UserID, Body: pgtype.Text{String: f.Body, Valid: true}, PublicConsent: f.Consent})
		if errors.Is(err, sql.ErrNoRows) {
			return Feedback{}, false, ErrReserved
		}
		return feedback(row), false, err
	}
	row, err := d.db.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: f.PostSlug, UserID: f.UserID, OriginalTenantID: uuid.NullUUID{UUID: f.TenantID, Valid: f.TenantID != uuid.Nil}, Body: pgtype.Text{String: f.Body, Valid: true}, PublicConsent: f.Consent})
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && pgerr.Code == "23505" {
		return Feedback{}, false, ErrConflict
	}
	return feedback(row), err == nil, err
}
func (d *databaseStore) DeleteOwnFeedback(ctx context.Context, slug string, user uuid.UUID) error {
	_, err := d.db.DeleteBlogFeedback(ctx, database.DeleteBlogFeedbackParams{PostSlug: slug, UserID: user})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	return err
}
func (d *databaseStore) PublicFeedback(ctx context.Context, slug string) ([]Feedback, error) {
	rows, err := d.db.ListPublicBlogFeedback(ctx, database.ListPublicBlogFeedbackParams{PostSlug: slug, LimitCount: 1000})
	if err != nil {
		return nil, err
	}
	out := make([]Feedback, 0, len(rows))
	for _, r := range rows {
		out = append(out, feedback(r))
	}
	return out, nil
}
func (d *databaseStore) ListFeedback(ctx context.Context) ([]Feedback, error) {
	rows, err := d.db.ListAdminBlogFeedback(ctx, database.ListAdminBlogFeedbackParams{LimitCount: 1000})
	if err != nil {
		return nil, err
	}
	out := make([]Feedback, 0, len(rows))
	for _, r := range rows {
		out = append(out, feedback(r))
	}
	return out, nil
}
func (d *databaseStore) Moderate(ctx context.Context, id uuid.UUID, action string, expected time.Time) error {
	if action == "delete" {
		row, err := d.db.GetBlogFeedbackByID(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		return d.DeleteOwnFeedback(ctx, row.PostSlug, row.UserID)
	}
	if expected.IsZero() {
		return ErrInvalid
	}
	status := "approved"
	if action == "reject" {
		status = "rejected"
	}
	_, err := d.db.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: id, Status: status, ExpectedUpdatedAt: pgtype.Timestamptz{Time: expected, Valid: true}})
	if errors.Is(err, sql.ErrNoRows) {
		return ErrConflict
	}
	return err
}
