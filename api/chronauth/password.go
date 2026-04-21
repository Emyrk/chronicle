package chronauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"
)

const (
	PasswordProvider = "password"

	// passwordSessionLifetime is the JWT lifetime for password-based sessions.
	// These sessions are not refreshable via OAuth, so use a longer lifetime.
	passwordSessionLifetime = 30 * 24 * time.Hour // 30 days

	minPasswordLength = 8
	maxPasswordLength = 128

	registerRateLimit          = 5 * time.Minute
	loginRateLimit             = 5 * time.Second
	verificationTokenLifetime  = 24 * time.Hour
	verificationResendCooldown = 5 * time.Minute
)
const (
	resetTokenLifetime = 1 * time.Hour
	resetCooldown      = 1 * time.Hour
)


type PasswordRegisterRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type PasswordLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Service) PasswordRegister(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Rate limit: one registration per IP per 5 minutes
	ip := extractIP(r)
	if !s.checkRegisterRateLimit(ip) {
		httpapi.Write(ctx, w, http.StatusTooManyRequests, map[string]string{
			"message": "Please wait before registering again.",
		})
		return
	}

	var req PasswordRegisterRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if err := validateEmail(req.Email); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{
			"message": "Invalid email address.",
			"detail":  err.Error(),
		})
		return
	}

	if err := validatePassword(req.Password); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{
			"message": "Invalid password.",
			"detail":  err.Error(),
		})
		return
	}

	if req.Username == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{
			"message": "Username is required.",
		})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, map[string]string{
			"message": "Internal error.",
		})
		return
	}

	now := time.Now()
	var session database.UserAuthSession

	// Check if signups are enabled
	siteConfig, err := s.Zed.GetSiteConfig(ctx)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, map[string]string{
			"message": "Internal error.",
		})
		return
	}
	if !siteConfig.SignupsEnabled {
		httpapi.Write(ctx, w, http.StatusForbidden, map[string]string{
			"message": "Signups are currently disabled.",
		})
		return
	}

	err = s.Zed.InTx(func(tx *authz.AuthzTX) error {
		// Check if this email is already registered with the password provider
		_, err := tx.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{
			LinkedID: req.Email,
			Provider: PasswordProvider,
		})
		if err == nil {
			err = errors.New("this email already exists")
			return httpapi.NewAPIError(err, "This email cannot be used for registration.", http.StatusBadRequest)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		// Reject if a user with this email already exists (e.g., from Discord OAuth).
		// Linking providers should only happen from an authenticated session, not registration.
		_, err = tx.GetUserByEmail(ctx, req.Email)
		if err == nil {
			err = errors.New("this email already exists")
			return httpapi.NewAPIError(err, "This email cannot be used for registration.", http.StatusBadRequest)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("check existing user: %w", err)
		}

		// Create new user
		userRow, err := tx.InsertUser(ctx, database.InsertUserParams{
			ID:        uuid.New(),
			Username:  req.Username,
			Email:     req.Email,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		if err != nil {
			return fmt.Errorf("insert user: %w", err)
		}
		userID := userRow.ID

		// Create auth link
		linked, err := tx.InsertUserAuth(ctx, database.InsertUserAuthParams{
			ID:        uuid.New(),
			LinkedID:  req.Email,
			UserID:    userID,
			Provider:  PasswordProvider,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		if err != nil {
			return fmt.Errorf("insert user auth: %w", err)
		}

		// Store password hash
		_, err = tx.InsertUserPassword(ctx, database.InsertUserPasswordParams{
			UserAuthID:   linked.ID,
			PasswordHash: string(hash),
			UpdatedAt:    database.Timestamptz(now),
		})
		if err != nil {
			return fmt.Errorf("insert user password: %w", err)
		}

		// Sync roles
		err = s.syncPasswordUser(ctx, tx, userID)
		if err != nil {
			return fmt.Errorf("sync password user: %w", err)
		}

		// Create session
		session, err = tx.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
			ID:                uuid.New(),
			JwtID:             uuid.New(),
			UserID:            userID,
			UserAuthID:        linked.ID,
			AccessToken:       "",
			AccessTokenSecret: "",
			RefreshToken:      "",
			ExpiresAt:         database.Timestamptz(now.Add(passwordSessionLifetime)),
			CreatedAt:         database.Timestamptz(now),
			UpdatedAt:         database.Timestamptz(now),
		})
		if err != nil {
			return fmt.Errorf("insert session: %w", err)
		}

		return nil
	}, nil)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Status: http.StatusInternalServerError,
		})
		return
	}

	err = s.SetSessionCookie(w, r, PasswordProvider, session)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, map[string]string{
			"message": "Failed to create session.",
		})
		return
	}

	s.logger.Info("new password user registered",
		slog.String("email", req.Email),
		slog.String("username", req.Username),
		slog.String("user_id", session.UserID.String()),
	)

	// Send verification email (non-blocking — don't fail registration)
	if s.mailer != nil {
		if err := s.sendVerificationToken(ctx, session.UserAuthID, req.Email); err != nil {
			s.logger.Error("failed to send verification email",
				slog.String("error", err.Error()),
				slog.String("email", req.Email),
			)
		}
	}

	httpapi.Write(ctx, w, http.StatusCreated, map[string]string{
		"message": "Account created. Please check your email to verify.",
	})
}

func (s *Service) PasswordLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	ip := extractIP(r)
	if !s.checkLoginRateLimit(ip) {
		httpapi.Write(ctx, w, http.StatusTooManyRequests, map[string]string{
			"message": "Too many login attempts. Please wait a few seconds.",
		})
		return
	}

	var req PasswordLoginRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// Look up auth link for this email + password provider
	linked, err := s.Zed.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{
		LinkedID: req.Email,
		Provider: PasswordProvider,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusUnauthorized, map[string]string{
				"message": "Invalid email or password.",
			})
			return
		}
		httpapi.Write(ctx, w, http.StatusInternalServerError, map[string]string{
			"message": "Internal error.",
		})
		return
	}

	// Get password hash
	pw, err := s.Zed.GetUserPasswordByAuthID(ctx, linked.ID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, map[string]string{
			"message": "Internal error.",
		})
		return
	}

	// Compare password
	err = bcrypt.CompareHashAndPassword([]byte(pw.PasswordHash), []byte(req.Password))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusUnauthorized, map[string]string{
			"message": "Invalid email or password.",
		})
		return
	}

	// Create session
	now := time.Now()
	session, err := s.Zed.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
		ID:                uuid.New(),
		JwtID:             uuid.New(),
		UserID:            linked.UserID,
		UserAuthID:        linked.ID,
		AccessToken:       "",
		AccessTokenSecret: "",
		RefreshToken:      "",
		ExpiresAt:         database.Timestamptz(now.Add(passwordSessionLifetime)),
		CreatedAt:         database.Timestamptz(now),
		UpdatedAt:         database.Timestamptz(now),
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, map[string]string{
			"message": "Internal error.",
		})
		return
	}

	// Sync roles on each login
	err = s.syncPasswordUser(ctx, s.Zed, linked.UserID)
	if err != nil {
		s.logger.Error("sync password user on login",
			slog.String("error", err.Error()),
			slog.String("user_id", linked.UserID.String()),
		)
		// Non-fatal: don't block login for role sync failure
	}

	err = s.SetSessionCookie(w, r, PasswordProvider, session)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, map[string]string{
			"message": "Failed to create session.",
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, map[string]string{
		"message": "Login successful.",
	})
}

func validateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("email is required")
	}
	_, err := mail.ParseAddress(email)
	if err != nil {
		return fmt.Errorf("invalid email format")
	}
	return nil
}

func validatePassword(password string) error {
	if len(password) < minPasswordLength {
		return fmt.Errorf("password must be at least %d characters", minPasswordLength)
	}
	if len(password) > maxPasswordLength {
		return fmt.Errorf("password must be at most %d characters", maxPasswordLength)
	}
	return nil
}

func (s *Service) checkLoginRateLimit(ip string) bool {
	if s.devMode {
		return true
	}
	s.loginMu.Lock()
	defer s.loginMu.Unlock()

	now := time.Now()
	for k, v := range s.loginAttempts {
		if now.Sub(v) > loginRateLimit {
			delete(s.loginAttempts, k)
		}
	}

	if last, ok := s.loginAttempts[ip]; ok && now.Sub(last) < loginRateLimit {
		return false
	}
	s.loginAttempts[ip] = now
	return true
}

func (s *Service) checkRegisterRateLimit(ip string) bool {
	if s.devMode {
		return true
	}
	s.registerMu.Lock()
	defer s.registerMu.Unlock()

	now := time.Now()
	// Lazy cleanup of expired entries
	for k, v := range s.registerAttempts {
		if now.Sub(v) > registerRateLimit {
			delete(s.registerAttempts, k)
		}
	}

	if last, ok := s.registerAttempts[ip]; ok && now.Sub(last) < registerRateLimit {
		return false
	}
	s.registerAttempts[ip] = now
	return true
}

// syncPasswordUser assigns the base Chronicle_member role to a password-auth user.
// Similar to SyncDiscordUser but without Discord-specific role mapping.
func (s *Service) syncPasswordUser(ctx context.Context, zed authz.DatabaseAuthorizer, userID uuid.UUID) error {
	b := policy.New()
	gChron := b.GlobalChronicle()
	usr := b.User(userID)

	// Clear existing roles for this user in the global namespace
	f := rel.NewFilter(gChron.Object().Typ, gChron.Object().ID, "")
	f.WithSubjectFilter(usr.Object().Typ, usr.Object().ID, "")
	err := zed.Delete(ctx, rel.NewPreconditionedFilter(f))
	if err != nil {
		return fmt.Errorf("zed.Delete: %w", err)
	}

	gChron.Chronicle_member(usr)
	_, err = zed.Write(ctx, *b.Txn())
	if err != nil {
		return fmt.Errorf("zed.Write: %w", err)
	}

	return nil
}

// generateVerificationToken creates a random token and returns (raw, sha256hash).
func generateVerificationToken() (string, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	raw := base64.URLEncoding.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	return raw, hex.EncodeToString(h[:]), nil
}

// sendVerificationToken generates a token, stores the hash, and sends the email.
func (s *Service) sendVerificationToken(ctx context.Context, userAuthID uuid.UUID, email string) error {
	raw, hash, err := generateVerificationToken()
	if err != nil {
		return fmt.Errorf("generate token: %w", err)
	}

	err = s.Zed.SetVerificationToken(ctx, database.SetVerificationTokenParams{
		UserAuthID:            userAuthID,
		VerificationTokenHash: pgtype.Text{String: hash, Valid: true},
		VerificationTokenExpiresAt: database.Timestamptz(
			time.Now().Add(verificationTokenLifetime),
		),
	})
	if err != nil {
		return fmt.Errorf("store token: %w", err)
	}

	return s.mailer.SendVerificationEmail(ctx, email, raw)
}

// VerifyEmail handles GET /auth/password/verify-email?token=...
func (s *Service) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Redirect(w, r, "/login?error=invalid_token", http.StatusTemporaryRedirect)
		return
	}

	h := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(h[:])

	row, err := s.Zed.GetUserPasswordByVerificationToken(ctx, pgtype.Text{String: hash, Valid: true})
	if err != nil {
		http.Redirect(w, r, "/login?error=invalid_token", http.StatusTemporaryRedirect)
		return
	}

	err = s.Zed.MarkEmailVerified(ctx, row.UserAuthID)
	if err != nil {
		s.logger.Error("mark email verified failed",
			slog.String("error", err.Error()),
			slog.String("user_auth_id", row.UserAuthID.String()),
		)
		http.Redirect(w, r, "/login?error=internal", http.StatusTemporaryRedirect)
		return
	}

	http.Redirect(w, r, "/login?verified=1", http.StatusTemporaryRedirect)
}

type ResendVerificationRequest struct {
	Email string `json:"email"`
}

// ResendVerification handles POST /auth/password/resend-verification
func (s *Service) ResendVerification(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims, authed := AuthenticatedClaims(ctx)
	if !authed {
		httpapi.Forbidden(w, errors.New("no claims found"))
		return
	}

	ip := extractIP(r)
	if !s.checkRegisterRateLimit(ip) {
		httpapi.Write(ctx, w, http.StatusTooManyRequests, map[string]string{
			"message": "Please wait before requesting another verification email.",
		})
		return
	}

	requesting, err := s.Zed.GetUserByID(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Always return 200 to avoid leaking email existence
	ok := map[string]string{"message": "If that email is registered, a verification email has been sent."}

	// Look up auth link
	linked, err := s.Zed.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{
		LinkedID: strings.ToLower(requesting.Email),
		Provider: PasswordProvider,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	// Check if already verified
	pw, err := s.Zed.GetUserPasswordByAuthID(ctx, linked.ID)
	if err != nil || pw.EmailVerified {
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	// Check cooldown via verification_token_created_at
	if pw.VerificationTokenCreatedAt.Valid &&
		time.Since(pw.VerificationTokenCreatedAt.Time) < verificationResendCooldown {
		httpapi.Write(ctx, w, http.StatusTooManyRequests, map[string]string{
			"message": "Please wait before requesting another verification email.",
		})
		return
	}

	if s.mailer != nil {
		if err := s.sendVerificationToken(ctx, linked.ID, requesting.Email); err != nil {
			s.logger.Error("resend verification email failed",
				slog.String("error", err.Error()),
				slog.String("email", requesting.Email),
			)
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, ok)
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPassword handles POST /auth/password/forgot-password
func (s *Service) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ForgotPasswordRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// Always return 200 to avoid leaking email existence
	ok := map[string]string{"message": "If an account exists with that email, a password reset link has been sent."}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if err := validateEmail(req.Email); err != nil {
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	// Look up auth link
	linked, err := s.Zed.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{
		LinkedID: req.Email,
		Provider: PasswordProvider,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	// Get password record to check cooldown
	pw, err := s.Zed.GetUserPasswordByAuthID(ctx, linked.ID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	// 1-hour cooldown
	if pw.ResetTokenCreatedAt.Valid &&
		time.Since(pw.ResetTokenCreatedAt.Time) < resetCooldown {
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	// Generate and store reset token
	raw, hash, err := generateVerificationToken()
	if err != nil {
		s.logger.Error("generate reset token", slog.String("error", err.Error()))
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	err = s.Zed.SetResetToken(ctx, database.SetResetTokenParams{
		UserAuthID:         linked.ID,
		ResetTokenHash:     pgtype.Text{String: hash, Valid: true},
		ResetTokenExpiresAt: database.Timestamptz(time.Now().Add(resetTokenLifetime)),
	})
	if err != nil {
		s.logger.Error("store reset token", slog.String("error", err.Error()))
		httpapi.Write(ctx, w, http.StatusOK, ok)
		return
	}

	if s.mailer != nil {
		if err := s.mailer.SendPasswordResetEmail(ctx, req.Email, raw); err != nil {
			s.logger.Error("send password reset email",
				slog.String("error", err.Error()),
				slog.String("email", req.Email),
			)
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, ok)
}

type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// ResetPassword handles POST /auth/password/reset-password
func (s *Service) ResetPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ResetPasswordRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Token == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{
			"message": "Reset token is required.",
		})
		return
	}

	if err := validatePassword(req.Password); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{
			"message": err.Error(),
		})
		return
	}

	// Hash the token and look up
	h := sha256.Sum256([]byte(req.Token))
	hash := hex.EncodeToString(h[:])

	row, err := s.Zed.GetUserPasswordByResetToken(ctx, pgtype.Text{String: hash, Valid: true})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{
			"message": "Invalid or expired reset link.",
		})
		return
	}

	// Hash new password
	bcryptHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Update password
	err = s.Zed.UpdateUserPassword(ctx, database.UpdateUserPasswordParams{
		UserAuthID:   row.UserAuthID,
		PasswordHash: string(bcryptHash),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Clear reset token
	err = s.Zed.ClearResetToken(ctx, row.UserAuthID)
	if err != nil {
		s.logger.Error("clear reset token", slog.String("error", err.Error()))
	}

	httpapi.Write(ctx, w, http.StatusOK, map[string]string{
		"message": "Password reset successfully. You can now sign in.",
	})
}

func extractIP(r *http.Request) string {
	// Check X-Forwarded-For first (Railway / reverse proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.IndexByte(xff, ','); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
