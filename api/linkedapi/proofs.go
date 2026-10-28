package linkedapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chroniclebot"
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
	h.notifyPhotoProof(ctx, id, user, tenant.Name, subjects)
	result, err := h.proofResponse(ctx, serviceproof.Scope{TenantID: tenant.ID}, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusCreated, result)
}

// notifyPhotoProof is best effort: a Discord or River failure never reverses a
// submitted proof or changes its HTTP response.
func (h *Handler) notifyPhotoProof(ctx context.Context, id, applicantID uuid.UUID, tenantName string, subjects []serviceproof.Subject) {
	if h.bot == nil || h.bot.Disabled() || h.bot.AdminNotificationsChannelID() == "" {
		return
	}
	if h.accessURL == nil {
		slog.ErrorContext(ctx, "photo proof notification URL unavailable", "request_id", id)
		return
	}
	// The proof has committed. A disconnected client should not cancel the
	// short attempt to enqueue its notification.
	notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	applicantName := applicantID.String()
	if applicant, err := h.zed.GetUserByID(notifyCtx, applicantID); err != nil {
		slog.WarnContext(notifyCtx, "photo proof applicant lookup failed", "request_id", id, "error", err)
	} else if applicant.Username != "" {
		applicantName = fmt.Sprintf("%s (%s)", applicant.Username, applicantID)
	}
	characters := make([]string, len(subjects))
	for i, subject := range subjects {
		characters[i] = fmt.Sprintf("%s (%s)", subject.Name, subject.RealmName)
	}
	err := chroniclebot.EnqueueAdminNotification(notifyCtx, h.queue, h.bot, chroniclebot.ArgsNotifyAdmin{
		Title: "New character-link photo proof",
		URL:   strings.TrimRight(h.accessURL.String(), "/") + "/admin/photo-proofs",
		Fields: []chroniclebot.AdminNotificationField{
			{Name: "Applicant", Value: applicantName, Inline: true},
			{Name: "Tenant", Value: tenantName, Inline: true},
			{Name: "Characters", Value: strings.Join(characters, "\n")},
			{Name: "Request", Value: id.String()},
		},
	})
	if err != nil {
		slog.ErrorContext(notifyCtx, "failed to enqueue photo proof notification", "request_id", id, "error", err)
	}
}

// notifyCharacterLinkDecision is best effort and only runs after the proof
// decision commits. Lookup or queue failures never change the review response.
func (h *Handler) notifyCharacterLinkDecision(ctx context.Context, proof chroniclesdk.ProofRequest) {
	if h.bot == nil || h.bot.Disabled() {
		return
	}
	notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	discord, err := h.zed.GetUserAuthLinkByUserIDAndProvider(notifyCtx, database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID:   proof.ApplicantID,
		Provider: "discord",
	})
	if errors.Is(err, sql.ErrNoRows) {
		return
	}
	if err != nil {
		slog.WarnContext(notifyCtx, "character-link decision Discord lookup failed", "request_id", proof.ID, "error", err)
		return
	}

	approved := make([]string, 0, len(proof.Subjects))
	rejected := make([]string, 0, len(proof.Subjects))
	for _, subject := range proof.Subjects {
		character := fmt.Sprintf("%s (%s)", subject.Name, subject.RealmName)
		switch subject.Status {
		case "approved":
			approved = append(approved, character)
		case "rejected":
			rejected = append(rejected, character)
		}
	}
	err = chroniclebot.EnqueueCharacterLinkDecision(notifyCtx, h.queue, h.bot, chroniclebot.ArgsNotifyCharacterLinkDecision{
		ProofID:            proof.ID.String(),
		DiscordID:          discord.LinkedID,
		Status:             proof.Status,
		URL:                h.characterLinkDecisionURL(proof),
		TenantName:         proof.TenantName,
		ApprovedCharacters: approved,
		RejectedCharacters: rejected,
		Response:           proof.Response,
	})
	if err != nil {
		slog.ErrorContext(notifyCtx, "failed to enqueue character-link decision notification", "request_id", proof.ID, "error", err)
	}
}

func (h *Handler) characterLinkDecisionURL(proof chroniclesdk.ProofRequest) string {
	if h.accessURL == nil {
		return ""
	}
	target := h.accessURL.ResolveReference(&url.URL{Path: "/account/characters"})
	if target.Scheme == "" || target.Host == "" {
		return ""
	}
	if proof.TenantID == uuid.Nil {
		return target.String()
	}
	primaryDomain := h.bot.PrimaryDomain()
	if proof.TenantSlug == "" || primaryDomain == "" {
		return ""
	}
	target.Host = proof.TenantSlug + "." + primaryDomain
	return target.String()
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
	// Requests made on the root domain have no tenant row.
	if row.TenantID == uuid.Nil {
		out.TenantName = "Main site"
	} else {
		tenant, err := h.zed.GetTenantByID(servicetenant.AdminBypass(ctx), row.TenantID)
		switch {
		case err == nil:
			out.TenantName = tenant.Name
			out.TenantSlug = tenant.Slug.String
		case !errors.Is(err, sql.ErrNoRows):
			return chroniclesdk.ProofRequest{}, err
		}
	}
	classes, err := h.zed.ListProofSubjectClasses(ctx, id)
	if err != nil {
		return chroniclesdk.ProofRequest{}, err
	}
	classBySubject := make(map[uuid.UUID]string, len(classes))
	guildBySubject := make(map[uuid.UUID]string, len(classes))
	for _, subject := range classes {
		classBySubject[subject.SubjectID] = string(subject.Class)
		guildBySubject[subject.SubjectID] = subject.GuildName.String
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
		out.Subjects = append(out.Subjects, chroniclesdk.ProofSubject{ProofCharacter: chroniclesdk.ProofCharacter{RealmID: s.RealmID.UUID, CharacterGUID: *s.CharacterGuid}, Name: s.Name, RealmName: s.RealmName, Class: classBySubject[s.ID], GuildName: guildBySubject[s.ID], Status: s.Status, Warning: warning})
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
	h.writeProofs(w, r, scope, rows, false)
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
	h.writeProofs(w, r, scope, rows, true)
}

func (h *Handler) writeProofs(w http.ResponseWriter, r *http.Request, scope serviceproof.Scope, rows []database.ProofRequest, reviewer bool) {
	ctx := r.Context()
	if scope.AllTenants {
		ctx = servicetenant.AdminBypass(ctx)
	}
	applicants := make(map[uuid.UUID]*chroniclesdk.ProofApplicant)
	result := make([]chroniclesdk.ProofRequest, 0, len(rows))
	for _, row := range rows {
		proof, err := h.proofResponse(r.Context(), scope, row.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if reviewer {
			applicant, ok := applicants[row.ApplicantID]
			if !ok {
				applicant, err = h.proofApplicant(ctx, row.ApplicantID)
				if err != nil {
					httpapi.InternalServerError(w, err)
					return
				}
				applicants[row.ApplicantID] = applicant
			}
			proof.Applicant = applicant
		}
		result = append(result, proof)
	}
	httpapi.Write(ctx, w, http.StatusOK, result)
}

func (h *Handler) proofApplicant(ctx context.Context, userID uuid.UUID) (*chroniclesdk.ProofApplicant, error) {
	user, err := h.zed.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := &chroniclesdk.ProofApplicant{Username: user.Username}
	discord, err := h.zed.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{UserID: userID, Provider: "discord"})
	switch {
	case err == nil:
		out.DiscordLinked = true
		out.DiscordID = discord.LinkedID
	case !errors.Is(err, sql.ErrNoRows):
		return nil, err
	}
	links, err := h.zed.GetUserCharacterLinks(ctx, userID)
	if err != nil {
		return nil, err
	}
	out.LinkedCharacters = db2sdk.LinkedCharacters(links)
	return out, nil
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
	h.notifyCharacterLinkDecision(r.Context(), result)
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}
