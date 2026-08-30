package claims

import (
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/google/uuid"
)

type Claims struct {
	Issuer    string           `json:"iss,omitempty"`
	Subject   uuid.UUID        `json:"sub,omitempty"`
	Audience  jwt.Audience     `json:"aud,omitempty"`
	Expiry    *jwt.NumericDate `json:"exp,omitempty"`
	NotBefore *jwt.NumericDate `json:"nbf,omitempty"`
	IssuedAt  *jwt.NumericDate `json:"iat,omitempty"`

	// ID is the JWT ID. Once the JWT is refreshed, this ID changes.
	ID uuid.UUID `json:"jti,omitempty"`
	// Session is the authentication session that can be refreshed.
	// Static between refreshes.
	SessionID uuid.UUID `json:"sid,omitempty"`
	// UserAuthID is the ID of the UserAuth (OAuth link). This is static per user
	// per provider.
	UserAuthID uuid.UUID `json:"uaid,omitempty"`
	// APIKeyID identifies the persistent CLI credential used for this request.
	APIKeyID uuid.UUID `json:"akid,omitempty"`

	// Extra custom claims
	Provider    string           `json:"provider,omitempty"`
	OAuthExpire *jwt.NumericDate `json:"oexp,omitempty"`
	Refreshable bool             `json:"refreshable,omitempty"`
	// Version is the Chronicle version that issued this JWT.
	// Used to reject old tokens when auth changes require re-login.
	Version *string `json:"ver,omitempty"`
}
