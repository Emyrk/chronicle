package visitorid

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	CookieName = "chronicle_visitor"
	cookieAge  = 365 * 24 * time.Hour
)

// Ensure returns the request's anonymous visitor ID, creating a first-party
// cookie when the request does not already contain a valid ID. Visitor IDs are
// analytics identifiers only and must never be used for authentication.
func Ensure(w http.ResponseWriter, r *http.Request) uuid.UUID {
	if cookie, err := r.Cookie(CookieName); err == nil {
		if id, err := uuid.Parse(cookie.Value); err == nil && id != uuid.Nil {
			return id
		}
	}

	id := uuid.New()
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    id.String(),
		Path:     "/",
		MaxAge:   int(cookieAge.Seconds()),
		Expires:  time.Now().Add(cookieAge),
		HttpOnly: true,
		Secure:   requestIsSecure(r),
		SameSite: http.SameSiteLaxMode,
	})
	return id
}

func requestIsSecure(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
