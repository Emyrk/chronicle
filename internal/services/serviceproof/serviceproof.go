// Package serviceproof owns the private evidence and review lifecycle for
// proof requests. Callers supply purpose-specific subjects and approval writes.
package serviceproof

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"image/jpeg"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

const Bucket = "proof-evidence"
const MaxImage = 8 << 20
const maxPixels = 20_000_000

var ErrInvalidImage = errors.New("invalid JPEG photo (maximum 8 MB and 20 megapixels)")
var ErrConflict = errors.New("proof already decided or subject changed")
var ErrEvidenceNotFound = errors.New("proof evidence unavailable")
var ErrEvidenceDeleted = errors.New("proof evidence deleted")

// Scope identifies a tenant's requests. AllTenants is reserved for a
// root-domain site admin, after the HTTP layer checks global authorization.
// It explicitly bypasses root-domain RLS to include non-discoverable tenants.
type Scope struct {
	TenantID   uuid.UUID
	AllTenants bool
}

func (scope Scope) context(ctx context.Context) context.Context {
	if scope.AllTenants {
		return servicetenant.AdminBypass(ctx)
	}
	return ctx
}

// Service stores and reviews evidence independent of the kind of ownership
// being proved. The subject-specific callback runs in the same transaction as
// the review decision, so approved ownership and audit status commit together.
type Service struct {
	db      *authz.Authz
	storage storage.ObjectStorage
}

func New(db *authz.Authz, objects storage.ObjectStorage) *Service {
	return &Service{db: db, storage: objects}
}

// EnsureBucket prepares the private evidence namespace at startup.
func EnsureBucket(ctx context.Context, objects storage.ObjectStorage) error {
	if objects == nil {
		return nil
	}
	_, err := objects.CreateBucket(ctx, Bucket, storage.BucketOptions{Public: false, AllowedMimeTypes: []string{"image/jpeg"}})
	if err != nil && err.Error() != "The resource already exists" {
		return err
	}
	return nil
}

func ValidateJPEG(data []byte) error {
	if len(data) < 4 || len(data) > MaxImage || !bytes.HasPrefix(data, []byte{0xff, 0xd8, 0xff}) {
		return ErrInvalidImage
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > maxPixels {
		return ErrInvalidImage
	}
	if _, err := jpeg.Decode(bytes.NewReader(data)); err != nil {
		return ErrInvalidImage
	}
	return nil
}

// Subject identifies one reviewed entity. Future purposes can use different
// subject types and leave character-specific fields empty.
type Subject struct {
	Type          string
	RealmID       uuid.NullUUID
	CharacterGUID *guid.GUID
	Name          string
	RealmName     string
}

func validateSubjects(subjects []Subject) error {
	for _, subject := range subjects {
		if subject.Type == "" {
			return errors.New("proof subject type is required")
		}
		if subject.Type == "character" && (!subject.RealmID.Valid || subject.CharacterGUID == nil) {
			return errors.New("character proof subject requires a realm and GUID")
		}
	}
	return nil
}

// Create writes the evidence first, then records the request and subjects in
// one transaction. The caller resolves and validates subject identities first.
func (s *Service) Create(ctx context.Context, tenantID, applicant uuid.UUID, purpose, message string, image []byte, subjects []Subject) (uuid.UUID, error) {
	if s.storage == nil {
		return uuid.Nil, errors.New("proof storage unavailable")
	}
	if purpose == "" || len(subjects) == 0 {
		return uuid.Nil, errors.New("proof purpose and subjects are required")
	}
	if err := validateSubjects(subjects); err != nil {
		return uuid.Nil, err
	}
	if err := ValidateJPEG(image); err != nil {
		return uuid.Nil, err
	}
	id := uuid.New()
	key := id.String() + ".jpg"
	mime := "image/jpeg"
	if _, err := s.storage.UploadFile(ctx, Bucket, key, bytes.NewReader(image), storage.FileOptions{ContentType: &mime}); err != nil {
		return uuid.Nil, err
	}
	err := s.db.InTx(ctx, func(tx *authz.AuthzTX) error {
		if _, err := tx.InsertProofRequest(ctx, database.InsertProofRequestParams{ID: id, TenantID: tenantID, ApplicantID: applicant, Purpose: purpose, EvidenceKey: key, Message: message}); err != nil {
			return err
		}
		for _, subject := range subjects {
			if err := tx.InsertProofSubject(ctx, database.InsertProofSubjectParams{
				RequestID: id, SubjectType: subject.Type, RealmID: subject.RealmID,
				CharacterGuid: subject.CharacterGUID, Name: subject.Name, RealmName: subject.RealmName,
			}); err != nil {
				return err
			}
		}
		return nil
	}, nil)
	if err != nil {
		// Cleanup must not depend on the request context: the client may already
		// have disconnected. Keep the original error available to callers.
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, removeErr := s.storage.RemoveFile(cleanup, Bucket, []string{key}); removeErr != nil {
			err = errors.Join(err, fmt.Errorf("orphan proof evidence %s: %w", key, removeErr))
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (s *Service) Get(ctx context.Context, scope Scope, id uuid.UUID) (database.ProofRequest, []database.ProofRequestSubject, error) {
	ctx = scope.context(ctx)
	var row database.ProofRequest
	var err error
	if scope.AllTenants {
		row, err = s.db.GetProofRequest(ctx, id)
	} else {
		row, err = s.db.GetTenantProofRequest(ctx, database.GetTenantProofRequestParams{ID: id, TenantID: scope.TenantID})
	}
	if err != nil {
		return database.ProofRequest{}, nil, err
	}
	subjects, err := s.db.ListProofSubjects(ctx, id)
	return row, subjects, err
}

func (s *Service) ListMine(ctx context.Context, tenantID, applicant uuid.UUID) ([]database.ProofRequest, error) {
	return s.db.ListMyProofRequests(ctx, database.ListMyProofRequestsParams{ApplicantID: applicant, TenantID: tenantID})
}

func (s *Service) ListForReview(ctx context.Context, scope Scope) ([]database.ProofRequest, error) {
	s.RetryCleanup(ctx, scope)
	ctx = scope.context(ctx)
	if scope.AllTenants {
		return s.db.ListAllProofRequests(ctx)
	}
	return s.db.ListAdminProofRequests(ctx, scope.TenantID)
}

// Evidence is called only after the HTTP layer has authorized an administrator.
// A completed request never serves its evidence, even if deletion is pending.
func (s *Service) Evidence(ctx context.Context, scope Scope, id uuid.UUID) ([]byte, error) {
	if s.storage == nil {
		return nil, errors.New("proof storage unavailable")
	}
	row, _, err := s.Get(ctx, scope, id)
	if err != nil {
		return nil, err
	}
	if row.Status != "pending" || row.EvidenceKey == "" {
		return nil, ErrEvidenceDeleted
	}
	data, err := s.storage.DownloadFile(ctx, Bucket, row.EvidenceKey)
	if errors.Is(err, storage.ErrFileNotFound) {
		return nil, ErrEvidenceNotFound
	}
	return data, err
}

// Approve is purpose-specific and runs inside the review transaction. It may
// reject a newly conflicting claim with ErrConflict. Decisions must cover
// every pending subject exactly once, keyed by subject row ID.
type Approve func(context.Context, *authz.AuthzTX, database.ProofRequest, database.ProofRequestSubject) error

func (s *Service) Decide(ctx context.Context, scope Scope, id, reviewer uuid.UUID, purpose, message string, decisions map[uuid.UUID]bool, approve Approve) error {
	if approve == nil {
		return errors.New("proof approval handler is required")
	}
	ctx = scope.context(ctx)
	err := s.db.InTx(ctx, func(tx *authz.AuthzTX) error {
		var row database.ProofRequest
		var err error
		if scope.AllTenants {
			row, err = tx.LockPendingProofRequestByID(ctx, id)
		} else {
			row, err = tx.LockPendingProofRequest(ctx, database.LockPendingProofRequestParams{ID: id, TenantID: scope.TenantID})
		}
		if errors.Is(err, sql.ErrNoRows) {
			return ErrConflict
		}
		if err != nil {
			return err
		}
		if row.Purpose != purpose {
			return ErrConflict
		}
		subjects, err := tx.ListProofSubjects(ctx, id)
		if err != nil {
			return err
		}
		if len(subjects) == 0 || len(subjects) != len(decisions) {
			return ErrConflict
		}
		approved := 0
		for _, subject := range subjects {
			accept, ok := decisions[subject.ID]
			if !ok || subject.Status != "pending" {
				return ErrConflict
			}
			status := "rejected"
			if accept {
				if err := approve(ctx, tx, row, subject); err != nil {
					return err
				}
				status = "approved"
				approved++
			}
			n, err := tx.DecideProofSubject(ctx, database.DecideProofSubjectParams{ID: subject.ID, Status: status})
			if err != nil {
				return err
			}
			if n != 1 {
				return ErrConflict
			}
		}
		status := "partial"
		if approved == 0 {
			status = "rejected"
		} else if approved == len(subjects) {
			status = "approved"
		}
		n, err := tx.DecideProofRequest(ctx, database.DecideProofRequestParams{ID: id, Status: status, Response: strings.TrimSpace(message), ReviewerID: uuid.NullUUID{UUID: reviewer, Valid: true}})
		if err != nil {
			return err
		}
		if n != 1 {
			return ErrConflict
		}
		return nil
	}, nil)
	if err != nil {
		return err
	}
	// Approval is durable before deletion. A failed object delete remains queued
	// for the next admin request; never expose completed evidence meanwhile.
	cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	s.RetryCleanup(cleanup, scope)
	return nil
}

func (s *Service) RetryCleanup(ctx context.Context, scope Scope) {
	if s.storage == nil {
		return
	}
	ctx = scope.context(ctx)
	var rows []database.ProofRequest
	var err error
	if scope.AllTenants {
		rows, err = s.db.ListAllProofEvidenceCleanup(ctx)
	} else {
		rows, err = s.db.ListProofEvidenceCleanup(ctx, scope.TenantID)
	}
	if err != nil {
		return
	}
	for _, row := range rows {
		if row.EvidenceKey != "" {
			if _, err := s.storage.RemoveFile(ctx, Bucket, []string{row.EvidenceKey}); err != nil && !errors.Is(err, storage.ErrFileNotFound) {
				continue
			}
		}
		_ = s.db.CompleteProofEvidenceCleanup(ctx, database.CompleteProofEvidenceCleanupParams{ID: row.ID, TenantID: row.TenantID})
	}
}
