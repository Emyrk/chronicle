package linkedapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image/jpeg"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

const ProofBucket = "proof-evidence"
const maxProofImage = 8 << 20
const maxProofPixels = 20_000_000

func proofError(w http.ResponseWriter, r *http.Request, status int, message string) {
	httpapi.Write(r.Context(), w, status, chroniclesdk.Response{Message: message})
}

func validateJPEG(data []byte) error {
	if len(data) < 4 || len(data) > maxProofImage || !bytes.HasPrefix(data, []byte{0xff, 0xd8, 0xff}) {
		return errors.New("photo must be a JPEG no larger than 8 MB")
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > maxProofPixels {
		return errors.New("invalid JPEG or image exceeds 20 megapixels")
	}
	if _, err := jpeg.Decode(bytes.NewReader(data)); err != nil {
		return errors.New("invalid JPEG image")
	}
	return nil
}

// SubmitProof accepts photo, characters (JSON array), and message multipart fields.
func (h *Handler) SubmitProof(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Require explicit tenant opt-in. Decode the stable JSON field directly so
	// this backend can land independently of the tenant settings UI changes.
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		proofError(w, r, http.StatusForbidden, "Photo proof is not enabled for this site")
		return
	}
	var config struct {
		Methods map[string]struct {
			Enabled bool `json:"enabled"`
		} `json:"methods"`
	}
	if json.Unmarshal(tenant.ExternalLinking, &config) != nil || !config.Methods["photo-proof"].Enabled {
		proofError(w, r, http.StatusForbidden, "Photo proof is not enabled for this site")
		return
	}
	if h.storage == nil {
		httpapi.InternalServerError(w, errors.New("proof storage unavailable"))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxProofImage+64*1024)
	if err := r.ParseMultipartForm(maxProofImage); err != nil {
		proofError(w, r, http.StatusBadRequest, "Invalid or oversized multipart submission")
		return
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()
	if len(r.FormValue("message")) > 2000 {
		proofError(w, r, 400, "Message too long")
		return
	}
	var choices []chroniclesdk.ProofCharacter
	if err := json.Unmarshal([]byte(r.FormValue("characters")), &choices); err != nil || len(choices) == 0 || len(choices) > 10 {
		proofError(w, r, 400, "Select between 1 and 10 characters")
		return
	}
	seen := map[string]bool{}
	for _, c := range choices {
		k := c.RealmID.String() + "/" + c.CharacterGUID.String()
		if c.RealmID == uuid.Nil || c.CharacterGUID == 0 || seen[k] {
			proofError(w, r, 400, "Invalid or duplicate character selection")
			return
		}
		seen[k] = true
	}
	f, header, err := r.FormFile("photo")
	if err != nil || header.Size > maxProofImage {
		proofError(w, r, 400, "A JPEG photo no larger than 8 MB is required")
		return
	}
	defer func() { _ = f.Close() }()
	data, err := io.ReadAll(io.LimitReader(f, maxProofImage+1))
	if err != nil || validateJPEG(data) != nil {
		proofError(w, r, 400, "Invalid JPEG photo (maximum 8 MB and 20 megapixels)")
		return
	}
	user := chronauth.AuthenticationState(r).Claims.Subject
	// Resolve selections before writing evidence; never accept a cross-realm GUID.
	players := make([]database.GetGamePlayerByGUIDRow, 0, len(choices))
	for _, c := range choices {
		player, err := h.zed.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: c.RealmID, Identifier: c.CharacterGUID})
		if errors.Is(err, sql.ErrNoRows) {
			proofError(w, r, 400, "Selected character does not exist on that realm")
			return
		}
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		players = append(players, player)
	}
	id := uuid.New()
	key := id.String() + ".jpg"
	mime := "image/jpeg"
	if _, err := h.storage.UploadFile(ctx, ProofBucket, key, bytes.NewReader(data), storage.FileOptions{ContentType: &mime}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	err = h.zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if _, err := tx.InsertProofRequest(ctx, database.InsertProofRequestParams{ID: id, ApplicantID: user, Purpose: "character-link", EvidenceKey: key, Message: r.FormValue("message")}); err != nil {
			return err
		}
		for i, c := range choices {
			if err := tx.InsertProofCharacterSubject(ctx, database.InsertProofCharacterSubjectParams{RequestID: id, RealmID: uuid.NullUUID{UUID: c.RealmID, Valid: true}, CharacterGuid: &choices[i].CharacterGUID, Name: players[i].Name, RealmName: players[i].RealmName}); err != nil {
				return err
			}
		}
		return nil
	}, nil)
	if err != nil {
		// The object was written before the transaction. Cleanup uses a fresh
		// context even when the client disconnected; log failures for operations.
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, removeErr := h.storage.RemoveFile(cleanup, ProofBucket, []string{key}); removeErr != nil {
			err = errors.Join(err, fmt.Errorf("orphan proof evidence %s: %w", key, removeErr))
		}
		if isProofPendingConflict(err) {
			proofError(w, r, http.StatusConflict, "A selected character already has a pending proof request")
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	result, err := h.proofResponse(ctx, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusCreated, result)
}

func isProofPendingConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "proof_request_subjects_pending_character"
}

func (h *Handler) proofResponse(ctx context.Context, id uuid.UUID) (chroniclesdk.ProofRequest, error) {
	row, err := h.zed.GetProofRequest(ctx, id)
	if err != nil {
		return chroniclesdk.ProofRequest{}, err
	}
	subjects, err := h.zed.ListProofSubjects(ctx, id)
	if err != nil {
		return chroniclesdk.ProofRequest{}, err
	}
	out := chroniclesdk.ProofRequest{ID: row.ID, ApplicantID: row.ApplicantID, Purpose: row.Purpose, Status: row.Status, Message: row.Message, Response: row.Response, CreatedAt: row.CreatedAt.Time, Subjects: make([]chroniclesdk.ProofSubject, 0, len(subjects))}
	if row.ReviewedAt.Valid {
		t := row.ReviewedAt.Time
		out.ReviewedAt = &t
	}
	for _, s := range subjects {
		if !s.RealmID.Valid || s.CharacterGuid == nil {
			continue
		}
		warning := s.Warning
		link, linkErr := h.zed.GetUserCharacterLink(ctx, database.GetUserCharacterLinkParams{RealmID: s.RealmID.UUID, CharacterGuid: *s.CharacterGuid})
		if linkErr == nil && link.UserID != row.ApplicantID {
			warning = "Character is already linked to another account"
		}
		if linkErr != nil && !errors.Is(linkErr, sql.ErrNoRows) {
			return chroniclesdk.ProofRequest{}, linkErr
		}
		out.Subjects = append(out.Subjects, chroniclesdk.ProofSubject{ProofCharacter: chroniclesdk.ProofCharacter{RealmID: s.RealmID.UUID, CharacterGUID: *s.CharacterGuid}, Name: s.Name, RealmName: s.RealmName, Status: s.Status, Warning: warning})
	}
	return out, nil
}

func (h *Handler) ListMyProofs(w http.ResponseWriter, r *http.Request) {
	rows, err := h.zed.ListMyProofRequests(r.Context(), chronauth.AuthenticationState(r).Claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	h.writeProofs(w, r, rows)
}
func (h *Handler) ListAdminProofs(w http.ResponseWriter, r *http.Request) {
	h.retryProofCleanup(r.Context())
	rows, err := h.zed.ListAdminProofRequests(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	h.writeProofs(w, r, rows)
}
func (h *Handler) writeProofs(w http.ResponseWriter, r *http.Request, rows []database.ProofRequest) {
	result := make([]chroniclesdk.ProofRequest, 0, len(rows))
	for _, row := range rows {
		proof, err := h.proofResponse(r.Context(), row.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		result = append(result, proof)
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}
func proofID(r *http.Request) (uuid.UUID, error) { return uuid.Parse(chi.URLParam(r, "id")) }
func (h *Handler) ProofImage(w http.ResponseWriter, r *http.Request) {
	id, err := proofID(r)
	if err != nil {
		proofError(w, r, 400, "Invalid proof ID")
		return
	}
	if h.storage == nil {
		httpapi.InternalServerError(w, errors.New("proof storage unavailable"))
		return
	}
	row, err := h.zed.GetProofRequest(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		proofError(w, r, 404, "Proof not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if row.Status != "pending" || row.EvidenceKey == "" {
		proofError(w, r, 404, "Evidence has been deleted")
		return
	}
	data, err := h.storage.DownloadFile(r.Context(), ProofBucket, row.EvidenceKey)
	if errors.Is(err, storage.ErrFileNotFound) {
		proofError(w, r, 404, "Evidence not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

var errProofConflict = errors.New("proof changed or character already linked")

func (h *Handler) DecideProof(w http.ResponseWriter, r *http.Request) {
	id, err := proofID(r)
	if err != nil {
		proofError(w, r, 400, "Invalid proof ID")
		return
	}
	var input chroniclesdk.DecideProofRequest
	if !httpapi.Read(r.Context(), w, r, &input) {
		return
	}
	if len(input.Message) > 2000 || len(input.Decisions) == 0 || len(input.Decisions) > 10 {
		proofError(w, r, 400, "Invalid proof decision")
		return
	}
	reviewer := chronauth.AuthenticationState(r).Claims.Subject
	err = h.zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		row, err := tx.LockPendingProofRequest(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return errProofConflict
		}
		if err != nil {
			return err
		}
		if row.Purpose != "character-link" {
			return errProofConflict
		}
		subjects, err := tx.ListProofSubjects(r.Context(), id)
		if err != nil {
			return err
		}
		if len(subjects) != len(input.Decisions) {
			return errProofConflict
		}
		choices := map[string]bool{}
		for _, d := range input.Decisions {
			k := d.RealmID.String() + "/" + d.CharacterGUID.String()
			if _, ok := choices[k]; ok {
				return errProofConflict
			}
			choices[k] = d.Approved
		}
		approved := 0
		for _, s := range subjects {
			if !s.RealmID.Valid || s.CharacterGuid == nil {
				return errProofConflict
			}
			key := s.RealmID.UUID.String() + "/" + s.CharacterGuid.String()
			accept, ok := choices[key]
			if !ok || s.Status != "pending" {
				return errProofConflict
			}
			status := "rejected"
			warning := ""
			if accept {
				// Protect existing links. A concurrent claim is also rejected by the
				// unique index; the entire decision transaction rolls back.
				existing, err := tx.GetUserCharacterLink(r.Context(), database.GetUserCharacterLinkParams{RealmID: s.RealmID.UUID, CharacterGuid: *s.CharacterGuid})
				if err == nil {
					_ = existing
					return errProofConflict
				}
				if !errors.Is(err, sql.ErrNoRows) {
					return err
				}
				if _, err = tx.InsertUserCharacterLink(r.Context(), database.InsertUserCharacterLinkParams{UserID: row.ApplicantID, RealmID: s.RealmID.UUID, CharacterGuid: *s.CharacterGuid, LinkedBy: uuid.NullUUID{UUID: reviewer, Valid: true}, LinkSource: "photo-proof"}); err != nil {
					if database.IsUniqueViolation(err, database.UniqueUserCharacterLinksCharacterGuidRealmIDKey) {
						return errProofConflict
					}
					return err
				}
				status = "approved"
				approved++
			}
			n, err := tx.DecideProofSubject(r.Context(), database.DecideProofSubjectParams{ID: s.ID, Status: status, Warning: warning})
			if err != nil {
				return err
			}
			if n != 1 {
				return errProofConflict
			}
		}
		status := "partial"
		if approved == 0 {
			status = "rejected"
		} else if approved == len(subjects) {
			status = "approved"
		}
		n, err := tx.DecideProofRequest(r.Context(), database.DecideProofRequestParams{ID: id, Status: status, Response: strings.TrimSpace(input.Message), ReviewerID: uuid.NullUUID{UUID: reviewer, Valid: true}})
		if err != nil {
			return err
		}
		if n != 1 {
			return errProofConflict
		}
		return nil
	}, nil)
	if errors.Is(err, errProofConflict) || (err != nil && database.IsUniqueViolation(err, database.UniqueUserCharacterLinksCharacterGuidRealmIDKey)) {
		proofError(w, r, http.StatusConflict, "Proof already decided or character already linked")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	// Audit and links are durable. Attempt deletion even if the client leaves;
	// failed evidence deletion stays queued in DB for the next admin request.
	cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	h.retryProofCleanup(cleanupCtx)
	result, err := h.proofResponse(r.Context(), id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}
func (h *Handler) retryProofCleanup(ctx context.Context) {
	if h.storage == nil {
		return
	}
	rows, err := h.zed.ListProofEvidenceCleanup(ctx)
	if err != nil {
		return
	}
	for _, row := range rows {
		if row.EvidenceKey != "" {
			if _, err := h.storage.RemoveFile(ctx, ProofBucket, []string{row.EvidenceKey}); err != nil {
				continue
			}
		}
		_ = h.zed.CompleteProofEvidenceCleanup(ctx, row.ID)
	}
}
