package chronauth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database/authz"
)

type authContextKey struct{}

type AuthenticationContext struct {
	Claims *claims.Claims
	Error  error
}

func AuthenticatedClaims(ctx context.Context) (*claims.Claims, bool) {
	state, ok := ctx.Value(authContextKey{}).(*AuthenticationContext)
	if !ok || state.Claims == nil {
		return nil, false
	}
	return state.Claims, true
}

func AuthenticationStateCtx(ctx context.Context) *AuthenticationContext {
	v, _ := ctx.Value(authContextKey{}).(*AuthenticationContext)
	return v
}

func AuthenticationState(r *http.Request) *AuthenticationContext {
	return AuthenticationStateCtx(r.Context())
}

func withState(r *http.Request, s *AuthenticationContext) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), authContextKey{}, s))
}

// bearerToken extracts a JWT from an "Authorization: Bearer <token>" header.
// Returns "" if the header is absent or malformed.
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}

// AuthenticationMiddleware should avoid hitting the database.
func (s *Service) AuthenticationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Bearer token auth (CLI / programmatic clients). Takes precedence over
		// the session cookie. Unlike the cookie path, a bad bearer token does
		// not trigger a logout (there is no session to clear) and tokens are
		// never auto-refreshed — clients re-authenticate when they expire.
		if token := bearerToken(r); token != "" {
			c, err := s.sessions.ValidateSession(token)
			if err != nil {
				next.ServeHTTP(w, withState(r, &AuthenticationContext{
					Error: fmt.Errorf("invalid bearer token (%s): %w", err.Error(), ErrNotAuthorized),
				}))
				return
			}
			next.ServeHTTP(w, withState(r, &AuthenticationContext{
				Claims: &c,
			}))
			return
		}

		auth, err := s.Store.Get(r, AuthSessionName)
		if err != nil {
			_ = s.Logout(w, r)
			next.ServeHTTP(w, withState(r, &AuthenticationContext{
				Error: err,
			}))
			return
		}

		jwt, ok := auth.Values["jwt"]
		if !ok {
			// No JWT, means probably no cookie
			next.ServeHTTP(w, withState(r, &AuthenticationContext{
				Error: ErrNotAuthorized,
			}))
			return
		}

		jwtStr, ok := jwt.(string)
		if !ok {
			_ = s.Logout(w, r)
			next.ServeHTTP(w, withState(r, &AuthenticationContext{
				Error: ErrNotAuthorized,
			}))
			return
		}

		c, err := s.sessions.ValidateSession(jwtStr)
		if err != nil {
			_ = s.Logout(w, r)
			next.ServeHTTP(w, withState(r, &AuthenticationContext{
				Error: fmt.Errorf("invalid session (%s): %w", err.Error(), ErrNotAuthorized),
			}))
			return
		}

		expiringDuration := time.Hour * 24
		lifespan := c.Expiry.Time().Sub(c.NotBefore.Time())
		if lifespan < time.Hour*48 {
			expiringDuration = time.Minute * 30
		}

		if time.Until(c.Expiry.Time()) < expiringDuration {
			// If the token is expiring, try to refresh it
			err := s.RefreshSession(r.Context(), w, r, &c)
			if err != nil && !errors.Is(err, ErrRefreshSkipped) {
				s.logger.Error("failed to refresh session",
					slog.String("error", err.Error()),
					slog.String("user_id", c.Subject.String()),
					slog.String("session_id", c.ID.String()),
				)
			}
		}

		next.ServeHTTP(w, withState(r, &AuthenticationContext{
			Claims: &c,
			Error:  nil,
		}))
	})
}

// RawSessionJWT returns the raw signed JWT stored in the request's session
// cookie. Used by the token-dump endpoint so users can extract a token for
// CLI / programmatic use. Returns ErrNotAuthorized if no session JWT exists.
func (s *Service) RawSessionJWT(r *http.Request) (string, error) {
	auth, err := s.Store.Get(r, AuthSessionName)
	if err != nil {
		return "", err
	}
	jwt, ok := auth.Values["jwt"]
	if !ok {
		return "", ErrNotAuthorized
	}
	jwtStr, ok := jwt.(string)
	if !ok || jwtStr == "" {
		return "", ErrNotAuthorized
	}
	return jwtStr, nil
}

// WithClaims injects synthetic claims into context for service-to-service auth.
// Used by server-side log upload to impersonate the chronicle-service account.
func WithClaims(ctx context.Context, c *claims.Claims) context.Context {
	return context.WithValue(ctx, authContextKey{}, &AuthenticationContext{
		Claims: c,
	})
}

func MustAuthenticatedClaims(ctx context.Context) *claims.Claims {
	c, ok := AuthenticatedClaims(ctx)
	if !ok || c == nil {
		panic("authenticated claims not found")
	}
	return c
}

var (
	ErrNotAuthorized = errors.New("not authorized")
)

func (s *Service) Authenticated(optional bool) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			state := AuthenticationState(r)
			if optional && (state.Error != nil || state.Claims == nil || state == nil) {
				next.ServeHTTP(w, r)
				return
			}

			if state == nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			if state.Error != nil {
				if errors.Is(state.Error, ErrNotAuthorized) {
					http.Error(w, state.Error.Error(), http.StatusUnauthorized)
					return
				}
				http.Error(w, state.Error.Error(), http.StatusInternalServerError)
				return
			}

			if state.Claims == nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			r = r.WithContext(authz.AsUser(r.Context(), state.Claims.Subject))
			next.ServeHTTP(w, r)
		})
	}
}
