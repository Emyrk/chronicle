package chronauth

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
)

var (
	ErrRefreshSkipped = fmt.Errorf("session refresh skipped")
)

const RefreshFailedCookieName = "chronicle_refresh_failed"

// RefreshSession refreshes the OAuth token and issues a new JWT.
// Call this when the current JWT's OAuthExpire claim is near/past expiry.
func (s *Service) RefreshSession(ctx context.Context, w http.ResponseWriter, r *http.Request, currentClaims *claims.Claims) error {
	if !currentClaims.Refreshable {
		return ErrRefreshSkipped
	}

	if s.shouldSkipRefresh(r, currentClaims.SessionID) {
		return ErrRefreshSkipped
	}

	// 2. Get the OAuth provider
	provider, ok := s.Providers[currentClaims.Provider]
	if !ok {
		s.markRefreshFailed(w, r, currentClaims.SessionID)
		return fmt.Errorf("provider not found")
	}

	err := s.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		// 1. Get the existing session from DB
		session, err := tx.GetUserAuthSessionByID(ctx, currentClaims.SessionID)
		if err != nil {
			return fmt.Errorf("get session: %w", err)
		}

		if session.JwtID != currentClaims.ID {
			// Whatever happened, the session JWT ID doesn't match the DB record.
			// So someone updated the session.
			return nil
		}

		if session.RefreshToken == "" {
			s.markRefreshFailed(w, r, session.ID)
			return fmt.Errorf("no refresh token available")
		}

		newToken, err := provider.RefreshToken(session.RefreshToken)
		if err != nil {
			_, _ = tx.UpdateUserAuthSessionTokens(ctx, database.UpdateUserAuthSessionTokensParams{
				ID:                session.ID,
				AccessToken:       session.AccessToken,
				AccessTokenSecret: session.AccessTokenSecret,
				RefreshToken:      "",
				ExpiresAt:         session.ExpiresAt,
				UpdatedAt:         session.UpdatedAt,
				// Just keep the old ID, since we did not issue a new one.
				JwtID: session.JwtID,
			})
			s.markRefreshFailed(w, r, session.ID)
			return fmt.Errorf("refresh token: %w", err)
		}

		newSession, err := tx.UpdateUserAuthSessionTokens(ctx, database.UpdateUserAuthSessionTokensParams{
			ID:                session.ID,
			AccessToken:       newToken.AccessToken,
			AccessTokenSecret: "", // What is this?
			RefreshToken:      newToken.RefreshToken,
			ExpiresAt:         database.Timestamptz(newToken.Expiry),
			UpdatedAt:         database.Timestamptz(time.Now()),
			JwtID:             uuid.New(),
		})
		if err != nil {
			s.markRefreshFailed(w, r, session.ID)
			return fmt.Errorf("update session tokens: %w", err)
		}

		err = s.SetSessionCookie(w, r, currentClaims.Provider, newSession)
		if err != nil {
			s.markRefreshFailed(w, r, session.ID)
			return fmt.Errorf("set session cookie: %w", err)
		}

		return nil
	}, nil)
	if err != nil {
		return fmt.Errorf("database transaction: %w", err)
	}

	s.logger.Debug("successfully refreshed session",
		slog.String("user_id", currentClaims.Subject.String()),
		slog.String("session_id", currentClaims.SessionID.String()),
	)

	return nil
}

// Mark this session as having a failed refresh - don't try again
func (s *Service) markRefreshFailed(w http.ResponseWriter, r *http.Request, sessionID uuid.UUID) {
	cookie := &http.Cookie{
		Name:     RefreshFailedCookieName,
		Value:    sessionID.String(), // tie it to this specific session
		Path:     "/",
		HttpOnly: true,
		Secure:   s.Store.Options.Secure,
		MaxAge:   int((24 * time.Hour).Seconds()), // stop trying for a week
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

// Check if we should skip refresh for this session
func (s *Service) shouldSkipRefresh(r *http.Request, sessionID uuid.UUID) bool {
	cookie, err := r.Cookie(RefreshFailedCookieName)
	if err != nil {
		return false // no cookie, ok to try
	}
	// Only skip if it's the same session that failed
	return cookie.Value == sessionID.String()
}

// Clear the failed marker (e.g., after successful re-login)
func (s *Service) clearRefreshFailed(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:   RefreshFailedCookieName,
		Value:  "",
		Path:   "/",
		MaxAge: -1, // delete
	})
}
