package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"math/big"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/time/rate"
)

const (
	devicePairTTL        = 10 * time.Minute
	devicePairInterval   = 5
	deviceTokenPrefix    = "chrdev_"
	maxDeviceNameLen     = 64
	userCodeAlphabet     = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I
	userCodeHalfLen      = 4
	pairStartPerMinute   = 6
	pairPollBurst        = 10
	deviceLimiterTTL     = 15 * time.Minute
	deviceLimiterMaxKeys = 10000
)

// ipLimiter is a small per-process, per-IP token bucket.
type ipLimiter struct {
	mu      sync.Mutex
	entries map[string]*ipLimiterEntry
	limit   rate.Limit
	burst   int
}

type ipLimiterEntry struct {
	l        *rate.Limiter
	lastSeen time.Time
}

func newIPLimiter(limit rate.Limit, burst int) *ipLimiter {
	return &ipLimiter{entries: map[string]*ipLimiterEntry{}, limit: limit, burst: burst}
}

func (i *ipLimiter) allow(key string) bool {
	now := time.Now()
	i.mu.Lock()
	defer i.mu.Unlock()
	if len(i.entries) > deviceLimiterMaxKeys {
		for k, e := range i.entries {
			if now.Sub(e.lastSeen) > deviceLimiterTTL {
				delete(i.entries, k)
			}
		}
	}
	e, ok := i.entries[key]
	if !ok {
		e = &ipLimiterEntry{l: rate.NewLimiter(i.limit, i.burst)}
		i.entries[key] = e
	}
	e.lastSeen = now
	return e.l.AllowN(now, 1)
}

func (i *ipLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !i.allow(requestIP(r)) {
			w.Header().Set("Retry-After", "10")
			httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.Response{
				Message: "Rate limit exceeded.",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requestIP uses the proxy-provided client IP, falling back to the peer.
func requestIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if idx := strings.IndexByte(fwd, ','); idx >= 0 {
			fwd = fwd[:idx]
		}
		return strings.TrimSpace(fwd)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func sha256Bytes(s string) []byte {
	h := sha256.Sum256([]byte(s))
	return h[:]
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func newUserCode() (string, error) {
	max := big.NewInt(int64(len(userCodeAlphabet)))
	out := make([]byte, 0, userCodeHalfLen*2+1)
	for i := 0; i < userCodeHalfLen*2; i++ {
		if i == userCodeHalfLen {
			out = append(out, '-')
		}
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out = append(out, userCodeAlphabet[n.Int64()])
	}
	return string(out), nil
}

func normalizeUserCode(code string) string {
	code = strings.ToUpper(strings.TrimSpace(code))
	if len(code) == userCodeHalfLen*2 && !strings.Contains(code, "-") {
		code = code[:userCodeHalfLen] + "-" + code[userCodeHalfLen:]
	}
	return code
}

// DevicePairStart begins a pairing. Unauthenticated, rate limited.
func (a *API) DevicePairStart(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.DevicePairStartRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.DeviceName)
	if name == "" {
		name = "Chronicle Sidekick"
	}
	if len(name) > maxDeviceNameLen {
		name = name[:maxDeviceNameLen]
	}

	// Opportunistic cleanup of long-expired pairings.
	_, _ = a.Opts.Zed.DeleteExpiredDevicePairings(ctx)

	deviceCode, err := randomHex(32)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	var pairing database.DevicePairing
	for attempt := 0; attempt < 5; attempt++ {
		code, err := newUserCode()
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		pairing, err = a.Opts.Zed.InsertDevicePairing(ctx, database.InsertDevicePairingParams{
			UserCode:       code,
			DeviceCodeHash: sha256Bytes(deviceCode),
			DeviceName:     name,
			ExpiresAt:      pgtype.Timestamptz{Time: time.Now().Add(devicePairTTL), Valid: true},
		})
		if err == nil {
			break
		}
		if !database.IsUniqueViolation(err) {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	if pairing.ID == uuid.Nil {
		httpapi.InternalServerError(w, errors.New("could not allocate pairing code"))
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.DevicePairStartResponse{
		Code:       pairing.UserCode,
		DeviceCode: deviceCode,
		ExpiresIn:  int(devicePairTTL.Seconds()),
		Interval:   devicePairInterval,
		VerifyURL:  strings.TrimRight(a.Opts.AccessURL.String(), "/") + "/pair?code=" + pairing.UserCode,
	})
}

// DevicePairPoll exchanges an approved pairing for a device token, exactly once.
func (a *API) DevicePairPoll(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.DevicePairPollRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	write := func(s chroniclesdk.DevicePairStatus, token string) {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.DevicePairPollResponse{Status: s, Token: token})
	}
	if req.DeviceCode == "" {
		write(chroniclesdk.DevicePairStatusExpired, "")
		return
	}

	pairing, err := a.Opts.Zed.GetDevicePairingByDeviceCodeHash(ctx, sha256Bytes(req.DeviceCode))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows) {
			write(chroniclesdk.DevicePairStatusExpired, "")
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	if pairing.Status == "redeemed" || !pairing.ExpiresAt.Time.After(time.Now()) {
		write(chroniclesdk.DevicePairStatusExpired, "")
		return
	}
	switch pairing.Status {
	case "pending":
		write(chroniclesdk.DevicePairStatusPending, "")
		return
	case "denied":
		write(chroniclesdk.DevicePairStatusDenied, "")
		return
	}

	token, err := randomHex(32)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	token = deviceTokenPrefix + token

	redeemed := true
	err = a.Opts.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		p, err := tx.RedeemDevicePairing(ctx, pairing.ID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows) {
				redeemed = false
				return nil
			}
			return err
		}
		_, err = tx.InsertUploadDevice(ctx, database.InsertUploadDeviceParams{
			UserID:    p.UserID.UUID,
			Name:      p.DeviceName,
			TokenHash: hashDeviceToken(token),
		})
		return err
	}, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !redeemed {
		write(chroniclesdk.DevicePairStatusExpired, "")
		return
	}
	write(chroniclesdk.DevicePairStatusOK, token)
}

func hashDeviceToken(token string) string {
	return hex.EncodeToString(sha256Bytes(token))
}

// DevicePairInfo shows the pending pairing to the logged-in user.
func (a *API) DevicePairInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p, err := a.Opts.Zed.GetDevicePairingByUserCode(ctx, normalizeUserCode(chi.URLParam(r, "code")))
	if err != nil || p.Status != "pending" {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "This pairing code is invalid or has expired.",
		})
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.DevicePairInfo{
		Code: p.UserCode, DeviceName: p.DeviceName, ExpiresAt: p.ExpiresAt.Time,
	})
}

func (a *API) resolvePair(status string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		userID := chronauth.MustAuthenticatedClaims(ctx).Subject
		_, err := a.Opts.Zed.ResolveDevicePairingByUserCode(ctx, database.ResolveDevicePairingByUserCodeParams{
			Status:   status,
			UserID:   uuid.NullUUID{UUID: userID, Valid: true},
			UserCode: normalizeUserCode(chi.URLParam(r, "code")),
		})
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows) {
				httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
					Message: "This pairing code is invalid, expired, or already used.",
				})
				return
			}
			httpapi.InternalServerError(w, err)
			return
		}
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "Pairing " + status + "."})
	}
}

func (a *API) ListMyDevices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := chronauth.MustAuthenticatedClaims(ctx).Subject
	rows, err := a.Opts.Zed.ListUploadDevicesByUser(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := make([]chroniclesdk.UploadDevice, 0, len(rows))
	for _, d := range rows {
		dev := chroniclesdk.UploadDevice{ID: d.ID, Name: d.Name, CreatedAt: d.CreatedAt.Time}
		if d.LastUsedAt.Valid {
			t := d.LastUsedAt.Time
			dev.LastUsedAt = &t
		}
		out = append(out, dev)
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}

func (a *API) RevokeMyDevice(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := chronauth.MustAuthenticatedClaims(ctx).Subject
	id, err := uuid.Parse(chi.URLParam(r, "deviceID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid device ID."})
		return
	}
	n, err := a.Opts.Zed.RevokeUploadDevice(ctx, database.RevokeUploadDeviceParams{ID: id, UserID: userID})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if n == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Device not found."})
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "Device revoked."})
}

type deviceCtxKey struct{}

// deviceTokenAuth authenticates "Bearer chrdev_..." tokens. It is only
// attached to the upload and whoami/device routes, so device tokens are
// rejected (as invalid JWTs) everywhere else. Non-device bearers fall through.
func (a *API) deviceTokenAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		const prefix = "Bearer "
		if len(h) <= len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) ||
			!strings.HasPrefix(strings.TrimSpace(h[len(prefix):]), deviceTokenPrefix) {
			next.ServeHTTP(w, r)
			return
		}
		token := strings.TrimSpace(h[len(prefix):])
		ctx := r.Context()
		dev, err := a.Opts.Zed.GetUploadDeviceByTokenHash(ctx, hashDeviceToken(token))
		if err != nil {
			status := http.StatusUnauthorized
			msg := "Invalid or revoked device token."
			if !errors.Is(err, sql.ErrNoRows) && !errors.Is(err, pgx.ErrNoRows) {
				status, msg = http.StatusInternalServerError, "Failed to verify device token."
			}
			httpapi.Write(ctx, w, status, chroniclesdk.Response{Message: msg})
			return
		}
		go func() { _ = a.Opts.Zed.TouchUploadDeviceLastUsed(context.Background(), dev.ID) }()

		ctx = chronauth.WithClaims(ctx, &claims.Claims{Subject: dev.UserID})
		ctx = context.WithValue(ctx, deviceCtxKey{}, dev)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// DeviceWhoAmI is the ping endpoint for device tokens.
func (a *API) DeviceWhoAmI(w http.ResponseWriter, r *http.Request) {
	dev, ok := r.Context().Value(deviceCtxKey{}).(database.UploadDevice)
	if !ok {
		httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{
			Message: "A device token is required.",
		})
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.DeviceWhoAmIResponse{
		UserID: dev.UserID, DeviceID: dev.ID, DeviceName: dev.Name,
	})
}
