package linkedapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceproof"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

// proofPermission checks the resolved tenant, never a tenant ID supplied by
// the client. SpiceDB folds site-wide grants into the tenant permission.
// Root-domain review accepts the site-wide reviewer or user-admin permission.
// Tenant admins have no implicit review permission.
func (h *Handler) proofPermission(review bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			actor, ok := authz.ActorFromContext(ctx)
			if !ok {
				httpapi.Forbidden(w, nil)
				return
			}
			b := policy.New()
			tenant := servicetenant.TenantFromContext(ctx)
			if tenant == nil && !review {
				httpapi.Forbidden(w, nil)
				return
			}
			var allowed bool
			var err error
			if tenant != nil {
				if review {
					allowed, err = h.zed.CheckOne(ctx, nil, b.Wow_tenant(tenant.ID).CanReview_photo_proof_User(actor))
				} else {
					allowed, err = h.zed.CheckOne(ctx, nil, b.Wow_tenant(tenant.ID).CanSubmit_photo_proof_User(actor))
				}
			} else {
				allowed, err = h.zed.CheckOne(ctx, nil, b.GlobalChronicle().CanReview_photo_proof_User(actor))
				if err == nil && !allowed {
					allowed, err = h.zed.CheckOne(ctx, nil, b.GlobalChronicle().CanAdmin_users_User(actor))
				}
			}
			if err != nil {
				httpapi.InternalServerError(w, err)
				return
			}
			if !allowed {
				httpapi.Forbidden(w, nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func proofError(w http.ResponseWriter, r *http.Request, status int, message string) {
	httpapi.Write(r.Context(), w, status, chroniclesdk.Response{Message: message})
}

func writeProofCooldown(w http.ResponseWriter, r *http.Request, next time.Time) {
	w.Header().Set("Retry-After", strconv.Itoa(max(1, int(time.Until(next).Seconds())+1)))
	httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.ProofCooldownResponse{
		Message:          "Only one photo proof request is allowed every 24 hours",
		NextSubmissionAt: &next,
	})
}

// SubmitProof validates character-specific selections before handing the
// evidence and request lifecycle to the shared proof service.
func (h *Handler) SubmitProof(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		proofError(w, r, http.StatusForbidden, "Photo proof is not enabled for this site")
		return
	}
	config := chroniclesdk.ParseExternalLinking(tenant.ExternalLinking)
	if config == nil || !config.Methods["photo-proof"].Enabled {
		proofError(w, r, http.StatusForbidden, "Photo proof is not enabled for this site")
		return
	}
	user := chronauth.AuthenticationState(r).Claims.Subject
	// Reject an existing cooldown before reading and decoding an image. The
	// proof service rechecks under the applicant row lock before insertion.
	next, err := h.proofs.Cooldown(ctx, user, "character-link")
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if next != nil {
		writeProofCooldown(w, r, *next)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, serviceproof.MaxImage+64*1024)
	if err := r.ParseMultipartForm(serviceproof.MaxImage); err != nil {
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
	if !validProofCharacters(choices) {
		proofError(w, r, 400, "Select distinct characters from a single realm")
		return
	}
	f, header, err := r.FormFile("photo")
	if err != nil || header.Size > serviceproof.MaxImage {
		proofError(w, r, 400, "A JPEG photo no larger than 8 MB is required")
		return
	}
	defer func() { _ = f.Close() }()
	image, err := io.ReadAll(io.LimitReader(f, serviceproof.MaxImage+1))
	if err != nil || serviceproof.ValidateJPEG(image) != nil {
		proofError(w, r, 400, serviceproof.ErrInvalidImage.Error())
		return
	}
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
	subjects := make([]serviceproof.Subject, len(choices))
	for i, c := range choices {
		subjects[i] = serviceproof.Subject{
			Type: "character", RealmID: uuid.NullUUID{UUID: c.RealmID, Valid: true},
			CharacterGUID: &choices[i].CharacterGUID, Name: players[i].Name, RealmName: players[i].RealmName,
		}
	}
	id, err := h.proofs.Create(ctx, tenant.ID, user, "character-link", r.FormValue("message"), image, subjects)
	var cooldown *serviceproof.CooldownError
	if errors.As(err, &cooldown) {
		writeProofCooldown(w, r, cooldown.NextSubmissionAt)
		return
	}
	if isProofPendingConflict(err) {
		proofError(w, r, http.StatusConflict, "A selected character already has a pending proof request")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result, err := h.proofResponse(ctx, serviceproof.Scope{TenantID: tenant.ID}, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusCreated, result)
}

func validProofCharacters(choices []chroniclesdk.ProofCharacter) bool {
	if len(choices) == 0 || len(choices) > 10 {
		return false
	}
	seen := map[string]bool{}
	realmID := choices[0].RealmID
	for _, c := range choices {
		key := c.RealmID.String() + "/" + c.CharacterGUID.String()
		if c.RealmID == uuid.Nil || c.RealmID != realmID || c.CharacterGUID == 0 || seen[key] {
			return false
		}
		seen[key] = true
	}
	return true
}

func isProofPendingConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "proof_request_subjects_pending_character"
}

func (h *Handler) proofResponse(ctx context.Context, scope serviceproof.Scope, id uuid.UUID) (chroniclesdk.ProofRequest, error) {
	if scope.AllTenants {
		ctx = servicetenant.AdminBypass(ctx)
	}
	row, subjects, err := h.proofs.Get(ctx, scope, id)
	if err != nil {
		return chroniclesdk.ProofRequest{}, err
	}
	out := chroniclesdk.ProofRequest{ID: row.ID, ApplicantID: row.ApplicantID, TenantID: row.TenantID, Purpose: row.Purpose, Status: row.Status, Message: row.Message, Response: row.Response, CreatedAt: row.CreatedAt.Time, Subjects: make([]chroniclesdk.ProofSubject, 0, len(subjects))}
	if row.ReviewedAt.Valid {
		t := row.ReviewedAt.Time
		out.ReviewedAt = &t
	}
	tenant, err := h.zed.GetTenantByID(servicetenant.AdminBypass(ctx), row.TenantID)
	if err != nil {
		return chroniclesdk.ProofRequest{}, err
	}
	out.TenantName = tenant.Name
	out.TenantSlug = tenant.Slug.String
	classes, err := h.zed.ListProofSubjectClasses(ctx, id)
	if err != nil {
		return chroniclesdk.ProofRequest{}, err
	}
	classBySubject := make(map[uuid.UUID]string, len(classes))
	for _, subject := range classes {
		classBySubject[subject.SubjectID] = string(subject.Class)
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
		out.Subjects = append(out.Subjects, chroniclesdk.ProofSubject{ProofCharacter: chroniclesdk.ProofCharacter{RealmID: s.RealmID.UUID, CharacterGUID: *s.CharacterGuid}, Name: s.Name, RealmName: s.RealmName, Class: classBySubject[s.ID], Status: s.Status, Warning: warning})
	}
	return out, nil
}

func (h *Handler) GetMyProofCooldown(w http.ResponseWriter, r *http.Request) {
	next, err := h.proofs.Cooldown(r.Context(), chronauth.AuthenticationState(r).Claims.Subject, "character-link")
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.ProofCooldownResponse{NextSubmissionAt: next})
}

func (h *Handler) ListMyProofs(w http.ResponseWriter, r *http.Request) {
	scope := serviceproof.Scope{TenantID: servicetenant.TenantIDFromContext(r.Context())}
	rows, err := h.proofs.ListMine(r.Context(), scope.TenantID, chronauth.AuthenticationState(r).Claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	h.writeProofs(w, r, scope, rows)
}

func reviewProofScope(ctx context.Context) serviceproof.Scope {
	if tenant := servicetenant.TenantFromContext(ctx); tenant != nil {
		return serviceproof.Scope{TenantID: tenant.ID}
	}
	return serviceproof.Scope{AllTenants: true}
}

func (h *Handler) ListAdminProofs(w http.ResponseWriter, r *http.Request) {
	scope := reviewProofScope(r.Context())
	rows, err := h.proofs.ListForReview(r.Context(), scope)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	h.writeProofs(w, r, scope, rows)
}

func (h *Handler) writeProofs(w http.ResponseWriter, r *http.Request, scope serviceproof.Scope, rows []database.ProofRequest) {
	result := make([]chroniclesdk.ProofRequest, 0, len(rows))
	for _, row := range rows {
		proof, err := h.proofResponse(r.Context(), scope, row.ID)
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
	data, err := h.proofs.Evidence(r.Context(), reviewProofScope(r.Context()), id)
	if errors.Is(err, sql.ErrNoRows) {
		proofError(w, r, 404, "Proof not found")
		return
	}
	if errors.Is(err, serviceproof.ErrEvidenceDeleted) {
		proofError(w, r, 404, "Evidence has been deleted")
		return
	}
	if errors.Is(err, serviceproof.ErrEvidenceNotFound) {
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
	// Resolve the API's realm/GUID identities into subject IDs. The service
	// rechecks this exact set after locking the pending request.
	scope := reviewProofScope(r.Context())
	_, subjects, err := h.proofs.Get(r.Context(), scope, id)
	if errors.Is(err, sql.ErrNoRows) {
		proofError(w, r, http.StatusConflict, "Proof already decided or character already linked")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	byCharacter := make(map[string]uuid.UUID, len(subjects))
	for _, subject := range subjects {
		if !subject.RealmID.Valid || subject.CharacterGuid == nil {
			proofError(w, r, http.StatusConflict, "Invalid character proof")
			return
		}
		byCharacter[subject.RealmID.UUID.String()+"/"+subject.CharacterGuid.String()] = subject.ID
	}
	decisions := make(map[uuid.UUID]bool, len(input.Decisions))
	for _, decision := range input.Decisions {
		key := decision.RealmID.String() + "/" + decision.CharacterGUID.String()
		subjectID, ok := byCharacter[key]
		if !ok {
			proofError(w, r, http.StatusConflict, "Invalid character proof decision")
			return
		}
		if _, exists := decisions[subjectID]; exists {
			proofError(w, r, http.StatusConflict, "Duplicate character proof decision")
			return
		}
		decisions[subjectID] = decision.Approved
	}
	reviewer := chronauth.AuthenticationState(r).Claims.Subject
	err = h.proofs.Decide(r.Context(), scope, id, reviewer, "character-link", input.Message, decisions, func(ctx context.Context, tx *authz.AuthzTX, row database.ProofRequest, subject database.ProofRequestSubject) error {
		if !subject.RealmID.Valid || subject.CharacterGuid == nil || subject.SubjectType != "character" {
			return serviceproof.ErrConflict
		}
		existing, err := tx.GetUserCharacterLink(ctx, database.GetUserCharacterLinkParams{RealmID: subject.RealmID.UUID, CharacterGuid: *subject.CharacterGuid})
		if err == nil {
			_ = existing
			return serviceproof.ErrConflict
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if _, err := tx.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{UserID: row.ApplicantID, RealmID: subject.RealmID.UUID, CharacterGuid: *subject.CharacterGuid, LinkedBy: uuid.NullUUID{UUID: reviewer, Valid: true}, LinkSource: "photo-proof"}); err != nil {
			if database.IsUniqueViolation(err, database.UniqueUserCharacterLinksCharacterGuidRealmIDKey) {
				return serviceproof.ErrConflict
			}
			return err
		}
		return nil
	})
	if errors.Is(err, serviceproof.ErrConflict) || (err != nil && database.IsUniqueViolation(err, database.UniqueUserCharacterLinksCharacterGuidRealmIDKey)) {
		proofError(w, r, http.StatusConflict, "Proof already decided or character already linked")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result, err := h.proofResponse(r.Context(), scope, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}
