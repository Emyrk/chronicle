package chronauth

import (
	"context"
	"crypto"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/authkeys"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"golang.org/x/mod/semver"
)

// MinimumVersion is the minimum Chronicle version required for valid JWTs.
// Tokens issued by older versions are rejected, forcing re-authentication.
const MinimumVersion = "0.0.260"

func validateVersion(ver *string) error {
	if ver == nil {
		return fmt.Errorf("token version is missing: re-login required")
	}

	// Empty, unknown, or non-semver tags mean local/dev builds — always accept.
	normalized := normalizeVersion(*ver)
	if *ver == "" || *ver == "unknown" || !semver.IsValid(normalized) {
		return nil
	}
	if semver.Compare(normalized, normalizeVersion(MinimumVersion)) < 0 {
		return fmt.Errorf("token version %s is below minimum %s: re-login required", *ver, MinimumVersion)
	}
	return nil
}

func normalizeVersion(v string) string {
	if !strings.HasPrefix(v, "v") {
		return "v" + v
	}
	return v
}

type SessionOptions struct {
	SecretPEM []byte
	Registry  prometheus.Registerer
}

type Sessions struct {
	Signer    jose.Signer
	Validator crypto.PublicKey
	Issuer    string

	createSessionGauge   prometheus.Gauge
	validateSessionGauge *prometheus.GaugeVec
}

func NewSessions(opts SessionOptions) (*Sessions, error) {
	secretKey, err := authkeys.ParsePrivateKey(opts.SecretPEM)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	if opts.Registry == nil {
		opts.Registry = prometheus.NewRegistry()
	}

	// Instantiate a signer using RSASSA-PSS (SHA512) with the given private key.
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.PS512, Key: secretKey}, nil)
	if err != nil {
		return nil, fmt.Errorf("create signer: %w", err)
	}

	factory := promauto.With(opts.Registry)
	return &Sessions{
		Signer:    signer,
		Validator: secretKey.Public(),
		Issuer:    "Chronicle", // TODO: make it a url?
		createSessionGauge: factory.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "api_auth",
			Name:      "create_session_count",
			Help:      "Count of sessions created",
		}),
		validateSessionGauge: factory.NewGaugeVec(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "api_auth",
			Name:      "validate_session_count",
			Help:      "Count of sessions validated",
		}, []string{"valid"}),
	}, nil
}

// ValidateSession returns the user ID && session id if the session is valid
func (a *Sessions) ValidateSession(payload string) (claims.Claims, error) {
	valid := false
	defer func() {
		a.validateSessionGauge.WithLabelValues(strconv.FormatBool(valid)).Inc()
	}()

	token, err := jwt.ParseSigned(payload, []jose.SignatureAlgorithm{
		jose.PS512,
	})
	if err != nil {
		return claims.Claims{}, fmt.Errorf("parse token: %w", err)
	}

	userClaims := claims.Claims{}
	err = token.Claims(a.Validator, &userClaims)
	if err != nil {
		return claims.Claims{}, fmt.Errorf("parse claims: %w", err)
	}

	err = userClaims.ValidateWithLeeway(claims.Expected{
		Issuer: a.Issuer,
		Time:   time.Now(),
	}, time.Minute)
	if err != nil {
		return claims.Claims{}, fmt.Errorf("validate claims: %w", err)
	}

	if err := validateVersion(userClaims.Version); err != nil {
		return claims.Claims{}, err
	}

	// TODO: Validate oauth expirartion

	//userID, err := uuid.Parse(claims.Subject)
	//if err != nil {
	//	return uuid.Nil, uuid.Nil, fmt.Errorf("parse subject: %w", err)
	//}
	//
	//sessionID, err := uuid.Parse(claims.ID)
	//if err != nil {
	//	return uuid.Nil, uuid.Nil, fmt.Errorf("parse subject: %w", err)
	//}

	valid = true
	return userClaims, nil
}

func (a *Sessions) CreateSession(ctx context.Context, provider string, session database.UserAuthSession) (string, error) {
	c := &claims.Claims{
		Issuer:      a.Issuer,
		Subject:     session.UserID,
		Audience:    []string{a.Issuer},
		Expiry:      jwt.NewNumericDate(session.ExpiresAt.Time),
		NotBefore:   jwt.NewNumericDate(session.CreatedAt.Time.Add(time.Minute * -1)),
		IssuedAt:    jwt.NewNumericDate(session.CreatedAt.Time),
		ID:          session.JwtID,
		SessionID:   session.ID,
		UserAuthID:  session.UserAuthID,
		Provider:    provider,
		OAuthExpire: jwt.NewNumericDate(session.ExpiresAt.Time),
		Refreshable: session.RefreshToken != "",
		Version:     ptr.Ref(version.GitTag),
	}
	payload, err := jwt.Signed(a.Signer).Claims(c).Serialize()
	if err != nil {
		return "", fmt.Errorf("sign session: %w", err)
	}
	a.createSessionGauge.Inc()

	return payload, nil
}
