package linkedapi

import (
	"context"
	"database/sql"
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
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceproof"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const guildOwnershipPurpose = "guild-ownership"

func (h *Handler) SubmitGuildProof(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	applicant := chronauth.AuthenticationState(r).Claims.Subject
	next, err := h.proofs.Cooldown(ctx, applicant, guildOwnershipPurpose)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if next != nil {
		writeGuildProofCooldown(w, r, *next)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, serviceproof.MaxImage+64*1024)
	if err := r.ParseMultipartForm(serviceproof.MaxImage); err != nil {
		proofError(w, r, http.StatusBadRequest, "Invalid or oversized multipart submission")
		return
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()
	if len(r.FormValue("message")) > 2000 {
		proofError(w, r, http.StatusBadRequest, "Message too long")
		return
	}
	guildID, err := uuid.Parse(r.FormValue("guild_id"))
	if err != nil {
		proofError(w, r, http.StatusBadRequest, "Invalid guild ID")
		return
	}
	guild, err := h.zed.GetGuildByID(ctx, guildID)
	if errors.Is(err, sql.ErrNoRows) {
		proofError(w, r, http.StatusNotFound, "Guild not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	claimed, err := h.zed.GuildHasLeader(ctx, guildID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if claimed {
		proofError(w, r, http.StatusConflict, "This guild page has already been claimed")
		return
	}

	characterGUID, err := guid.FromString(r.FormValue("character_guid"))
	if err != nil {
		proofError(w, r, http.StatusBadRequest, "Select the character that leads this guild")
		return
	}
	player, err := h.zed.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{RealmID: guild.RealmID, Identifier: characterGUID})
	if errors.Is(err, sql.ErrNoRows) || (err == nil && player.GuildID.UUID != guild.ID) {
		proofError(w, r, http.StatusBadRequest, "That character is not in this guild's armory roster")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	link, err := h.zed.GetUserCharacterLink(ctx, database.GetUserCharacterLinkParams{CharacterGuid: characterGUID, RealmID: guild.RealmID})
	if errors.Is(err, sql.ErrNoRows) || (err == nil && link.UserID != applicant) {
		proofError(w, r, http.StatusBadRequest, fmt.Sprintf("Link %s to your account before claiming this guild", player.Name))
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil || header.Size > serviceproof.MaxImage {
		proofError(w, r, http.StatusBadRequest, "A JPEG screenshot no larger than 8 MB is required")
		return
	}
	defer func() { _ = file.Close() }()
	image, err := io.ReadAll(io.LimitReader(file, serviceproof.MaxImage+1))
	if err != nil || serviceproof.ValidateJPEG(image) != nil {
		proofError(w, r, http.StatusBadRequest, serviceproof.ErrInvalidImage.Error())
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	subjects := []serviceproof.Subject{{
		Type: "guild", GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true},
		RealmID:       uuid.NullUUID{UUID: guild.RealmID, Valid: true},
		CharacterGUID: &characterGUID,
		Name:          guild.Name, RealmName: guild.RealmName,
	}}
	id, err := h.proofs.Create(ctx, tenantID, applicant, guildOwnershipPurpose, r.FormValue("message"), image, subjects)
	var cooldown *serviceproof.CooldownError
	if errors.As(err, &cooldown) {
		writeGuildProofCooldown(w, r, cooldown.NextSubmissionAt)
		return
	}
	if isPendingGuildProofConflict(err) {
		proofError(w, r, http.StatusConflict, "This guild already has a pending claim")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	h.notifyGuildProof(ctx, id, applicant, guild.Name, guild.RealmName)
	result, err := h.proofResponse(ctx, serviceproof.Scope{TenantID: tenantID}, id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusCreated, result)
}

func (h *Handler) GetMyGuildProofCooldown(w http.ResponseWriter, r *http.Request) {
	next, err := h.proofs.Cooldown(r.Context(), chronauth.AuthenticationState(r).Claims.Subject, guildOwnershipPurpose)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.ProofCooldownResponse{NextSubmissionAt: next})
}

func writeGuildProofCooldown(w http.ResponseWriter, r *http.Request, next time.Time) {
	w.Header().Set("Retry-After", strconv.Itoa(max(1, int(time.Until(next).Seconds())+1)))
	httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.ProofCooldownResponse{
		Message: "Only one guild claim is allowed every 24 hours", NextSubmissionAt: &next,
	})
}

func isPendingGuildProofConflict(err error) bool {
	return database.IsUniqueViolation(err, database.UniqueProofRequestSubjectsPendingGuild)
}

func (h *Handler) notifyGuildProof(ctx context.Context, id, applicantID uuid.UUID, guildName, realmName string) {
	if h.bot == nil || h.bot.Disabled() || h.bot.AdminNotificationsChannelID() == "" || h.accessURL == nil {
		return
	}
	notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	applicantName := applicantID.String()
	if applicant, err := h.zed.GetUserByID(notifyCtx, applicantID); err != nil {
		slog.WarnContext(notifyCtx, "guild claim applicant lookup failed", "request_id", id, "error", err)
	} else if applicant.Username != "" {
		applicantName = fmt.Sprintf("%s (%s)", applicant.Username, applicantID)
	}
	err := chroniclebot.EnqueueAdminNotification(notifyCtx, h.queue, h.bot, chroniclebot.ArgsNotifyAdmin{
		Title: "New guild-page claim",
		URL:   strings.TrimRight(h.accessURL.String(), "/") + "/admin/photo-proofs",
		Fields: []chroniclebot.AdminNotificationField{
			{Name: "Applicant", Value: applicantName, Inline: true},
			{Name: "Guild", Value: fmt.Sprintf("%s (%s)", guildName, realmName), Inline: true},
			{Name: "Request", Value: id.String()},
		},
	})
	if err != nil {
		slog.ErrorContext(notifyCtx, "failed to enqueue guild claim notification", "request_id", id, "error", err)
	}
}

func (h *Handler) decideGuildProof(ctx context.Context, scope serviceproof.Scope, request database.ProofRequest, subjects []database.ProofRequestSubject, reviewer uuid.UUID, input chroniclesdk.DecideProofRequest) error {
	if len(subjects) != 1 || len(input.Decisions) != 1 || subjects[0].SubjectType != "guild" || !subjects[0].GuildID.Valid {
		return serviceproof.ErrConflict
	}
	decision := input.Decisions[0]
	if decision.GuildID == nil || *decision.GuildID != subjects[0].GuildID.UUID {
		return serviceproof.ErrConflict
	}
	decisions := map[uuid.UUID]bool{subjects[0].ID: decision.Approved}
	return h.proofs.Decide(ctx, scope, request.ID, reviewer, guildOwnershipPurpose, input.Message, decisions, func(ctx context.Context, tx *authz.AuthzTX, row database.ProofRequest, subject database.ProofRequestSubject) error {
		if subject.SubjectType != "guild" || !subject.GuildID.Valid {
			return serviceproof.ErrConflict
		}
		builder := policy.New()
		builder.Guild(subject.GuildID.UUID).Delete().Member(builder.User(row.ApplicantID))
		guild := builder.Guild(subject.GuildID.UUID)
		guild.Chronicle(builder.GlobalChronicle())
		guild.Leader(builder.User(row.ApplicantID))
		txn := builder.Txn()
		txn.MustNotMatch(rel.NewFilter("guild", subject.GuildID.UUID.String(), "leader"))
		if _, err := tx.Write(ctx, *txn); err != nil {
			if status.Code(err) == codes.FailedPrecondition {
				return serviceproof.ErrConflict
			}
			return err
		}
		return nil
	})
}

func (h *Handler) notifyGuildClaimDecision(ctx context.Context, proof chroniclesdk.ProofRequest) {
	if h.bot == nil || h.bot.Disabled() || len(proof.Subjects) != 1 {
		return
	}
	notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	discord, err := h.zed.GetUserAuthLinkByUserIDAndProvider(notifyCtx, database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID: proof.ApplicantID, Provider: "discord",
	})
	if errors.Is(err, sql.ErrNoRows) {
		return
	}
	if err != nil {
		slog.WarnContext(notifyCtx, "guild claim decision Discord lookup failed", "request_id", proof.ID, "error", err)
		return
	}
	subject := proof.Subjects[0]
	err = chroniclebot.EnqueueGuildClaimDecision(notifyCtx, h.queue, h.bot, chroniclebot.ArgsNotifyGuildClaimDecision{
		ProofID: proof.ID.String(), DiscordID: discord.LinkedID, Status: proof.Status,
		URL: h.guildClaimDecisionURL(proof), TenantName: proof.TenantName,
		GuildName: subject.Name, RealmName: subject.RealmName, Response: proof.Response,
	})
	if err != nil {
		slog.ErrorContext(notifyCtx, "failed to enqueue guild claim decision notification", "request_id", proof.ID, "error", err)
	}
}

func (h *Handler) guildClaimDecisionURL(proof chroniclesdk.ProofRequest) string {
	if h.accessURL == nil || len(proof.Subjects) != 1 || proof.Subjects[0].GuildID == nil {
		return ""
	}
	target := h.accessURL.ResolveReference(&url.URL{Path: "/g/" + proof.Subjects[0].GuildID.String()})
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
