package serviceoauth

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ory/fosite"
)

const (
	tokenTypeAccess    = "access"
	tokenTypeRefresh   = "refresh"
	tokenTypeAuthorize = "authorize"

	defaultTransactionLifetime        = 15 * time.Second
	defaultTransactionFinalizeTimeout = 5 * time.Second
)

type oauthStore interface {
	GetOrCreateOAuthServerSecret(context.Context, []byte) ([]byte, error)
	CreateOAuthDeviceSession(context.Context, database.CreateOAuthDeviceSessionParams) error
	GetOAuthDeviceSession(context.Context, string) (database.GetOAuthDeviceSessionRow, error)
	UpdateOAuthDeviceSessionByUserSignature(context.Context, database.UpdateOAuthDeviceSessionByUserSignatureParams) (string, error)
	InvalidateOAuthDeviceSession(context.Context, string) (int64, error)
	DeleteExpiredOAuthDeviceSessions(context.Context) (int64, error)
	CreateOAuthTokenSession(context.Context, database.CreateOAuthTokenSessionParams) error
	GetOAuthTokenSession(context.Context, database.GetOAuthTokenSessionParams) ([]byte, error)
	DeleteOAuthTokenSession(context.Context, database.DeleteOAuthTokenSessionParams) (int64, error)
	DeleteExpiredOAuthTokenSessions(context.Context) (int64, error)
	RevokeOAuthTokenSessions(context.Context, database.RevokeOAuthTokenSessionsParams) (int64, error)
	RotateOAuthRefreshToken(context.Context, database.RotateOAuthRefreshTokenParams) (int64, error)
	DeleteOAuthTokenSessionsByRequestID(context.Context, string) (int64, error)
	UpsertSidekickInstallation(context.Context, database.UpsertSidekickInstallationParams) (database.SidekickInstallation, error)
	SetSidekickInstallationCampaign(context.Context, database.SetSidekickInstallationCampaignParams) error
	RevokeActiveSidekickOAuthGrants(context.Context, uuid.UUID) ([]string, error)
	InsertSidekickOAuthGrant(context.Context, database.InsertSidekickOAuthGrantParams) error
	GetSidekickInstallationForOAuthRequest(context.Context, database.GetSidekickInstallationForOAuthRequestParams) (uuid.UUID, error)
	InTx(context.Context, func(database.Store) error, *pgx.TxOptions) error
}

type storage struct {
	db                         oauthStore
	deviceCodeLifespan         time.Duration
	accessTokenLifespan        time.Duration
	refreshTokenLifespan       time.Duration
	transactionLifetime        time.Duration
	transactionFinalizeTimeout time.Duration
}

type transactionContextKey struct{}

type transactionState struct {
	db              oauthStore
	finish          chan error
	result          chan error
	cancel          context.CancelFunc
	finalizeTimeout time.Duration

	mu        sync.Mutex
	completed bool
}

var (
	errTransactionRollback      = errors.New("serviceoauth: transaction rollback")
	errTransactionFinishTimeout = errors.New("serviceoauth: transaction completion timed out")
)

func (s *storage) dbFor(ctx context.Context) oauthStore {
	if tx, ok := ctx.Value(transactionContextKey{}).(*transactionState); ok {
		return tx.db
	}
	return s.db
}

func (s *storage) BeginTX(ctx context.Context) (context.Context, error) {
	lifetime := s.transactionLifetime
	if lifetime <= 0 {
		lifetime = defaultTransactionLifetime
	}
	finalizeTimeout := s.transactionFinalizeTimeout
	if finalizeTimeout <= 0 {
		finalizeTimeout = defaultTransactionFinalizeTimeout
	}

	txCtx, cancel := context.WithTimeout(ctx, lifetime)
	txCtx = database.WithTransactionFinalizeTimeout(txCtx, finalizeTimeout)
	ready := make(chan oauthStore, 1)
	accepted := make(chan struct{})
	finish := make(chan error, 1)
	result := make(chan error, 1)
	go func() {
		defer cancel()
		err := s.db.InTx(txCtx, func(tx database.Store) error {
			ready <- tx
			select {
			case <-accepted:
			case <-txCtx.Done():
				return txCtx.Err()
			}
			select {
			case err := <-finish:
				return err
			case <-txCtx.Done():
				return txCtx.Err()
			}
		}, &pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
		result <- err
	}()

	select {
	case tx := <-ready:
		if err := ctx.Err(); err != nil {
			cancel()
			return ctx, err
		}
		close(accepted)
		return context.WithValue(txCtx, transactionContextKey{}, &transactionState{
			db: tx, finish: finish, result: result, cancel: cancel, finalizeTimeout: finalizeTimeout,
		}), nil
	case err := <-result:
		cancel()
		return ctx, err
	case <-ctx.Done():
		cancel()
		return ctx, ctx.Err()
	}
}

func (s *storage) Commit(ctx context.Context) error {
	return completeTransaction(ctx, nil)
}

func (s *storage) Rollback(ctx context.Context) error {
	err := completeTransaction(ctx, errTransactionRollback)
	if errors.Is(err, errTransactionRollback) {
		return nil
	}
	return err
}

func completeTransaction(ctx context.Context, completion error) error {
	tx, ok := ctx.Value(transactionContextKey{}).(*transactionState)
	if !ok {
		return errors.New("serviceoauth: transaction missing from context")
	}
	tx.mu.Lock()
	defer tx.mu.Unlock()
	if tx.completed {
		return nil
	}
	tx.finish <- completion
	timer := time.NewTimer(tx.finalizeTimeout)
	defer timer.Stop()
	var err error
	select {
	case err = <-tx.result:
	case <-timer.C:
		err = errTransactionFinishTimeout
	}
	tx.completed = true
	tx.cancel()
	return err
}

func (s *storage) cleanupExpired(ctx context.Context) error {
	if _, err := s.db.DeleteExpiredOAuthDeviceSessions(ctx); err != nil {
		return err
	}
	_, err := s.db.DeleteExpiredOAuthTokenSessions(ctx)
	return err
}

type storedRequest struct {
	ID                string                `json:"id"`
	RequestedAt       time.Time             `json:"requested_at"`
	ClientID          string                `json:"client_id"`
	RequestedScope    fosite.Arguments      `json:"requested_scope"`
	GrantedScope      fosite.Arguments      `json:"granted_scope"`
	Form              map[string][]string   `json:"form"`
	Session           fosite.DefaultSession `json:"session"`
	RequestedAudience fosite.Arguments      `json:"requested_audience"`
	GrantedAudience   fosite.Arguments      `json:"granted_audience"`
	UserCodeState     *fosite.UserCodeState `json:"user_code_state,omitempty"`
}

func encodeRequest(request fosite.Requester) ([]byte, error) {
	session, ok := request.GetSession().(*fosite.DefaultSession)
	if !ok {
		return nil, errors.New("serviceoauth: unsupported fosite session type")
	}
	stored := storedRequest{
		ID:                request.GetID(),
		RequestedAt:       request.GetRequestedAt(),
		ClientID:          request.GetClient().GetID(),
		RequestedScope:    request.GetRequestedScopes(),
		GrantedScope:      request.GetGrantedScopes(),
		Form:              request.GetRequestForm(),
		Session:           *session,
		RequestedAudience: request.GetRequestedAudience(),
		GrantedAudience:   request.GetGrantedAudience(),
	}
	if device, ok := request.(fosite.DeviceRequester); ok {
		state := device.GetUserCodeState()
		stored.UserCodeState = &state
	}
	return json.Marshal(stored)
}

func decodeRequest(data []byte, session fosite.Session, device bool) (fosite.Requester, error) {
	var stored storedRequest
	if err := json.Unmarshal(data, &stored); err != nil {
		return nil, err
	}

	defaultSession, ok := session.(*fosite.DefaultSession)
	if !ok || defaultSession == nil {
		defaultSession = &fosite.DefaultSession{}
	}
	*defaultSession = stored.Session

	if stored.ClientID != compiledClient.ID {
		return nil, errors.New("serviceoauth: stored request has unknown client")
	}
	request := fosite.NewRequest()
	request.ID = stored.ID
	request.RequestedAt = stored.RequestedAt
	request.Client = compiledClient
	request.RequestedScope = stored.RequestedScope
	request.GrantedScope = stored.GrantedScope
	request.Form = stored.Form
	request.Session = defaultSession
	request.RequestedAudience = stored.RequestedAudience
	request.GrantedAudience = stored.GrantedAudience

	if !device {
		return request, nil
	}
	deviceRequest := &fosite.DeviceRequest{Request: *request}
	if stored.UserCodeState != nil {
		deviceRequest.UserCodeState = *stored.UserCodeState
	}
	return deviceRequest, nil
}

func (s *storage) GetClient(_ context.Context, id string) (fosite.Client, error) {
	if id != compiledClient.ID {
		return nil, fosite.ErrNotFound
	}
	return compiledClient, nil
}

func (s *storage) ClientAssertionJWTValid(context.Context, string) error          { return nil }
func (s *storage) SetClientAssertionJWT(context.Context, string, time.Time) error { return nil }

func (s *storage) CreateDeviceAuthSession(ctx context.Context, deviceSignature, userSignature string, request fosite.DeviceRequester) error {
	encoded, err := encodeRequest(request)
	if err != nil {
		return err
	}
	expiresAt := request.GetSession().GetExpiresAt(fosite.DeviceCode)
	if expiresAt.IsZero() {
		expiresAt = request.GetRequestedAt().Add(s.deviceCodeLifespan)
	}
	params := database.CreateOAuthDeviceSessionParams{
		DeviceSignature: deviceSignature,
		UserSignature:   userSignature,
		Request:         encoded,
		ExpiresAt:       pgtype.Timestamptz{Time: expiresAt, Valid: true},
	}
	if metadata, ok := pendingSidekickMetadata(ctx); ok {
		params.SidekickInstallationID = uuid.NullUUID{UUID: metadata.ID, Valid: true}
		params.SidekickInstallationName = pgtype.Text{String: metadata.Name, Valid: true}
		params.SidekickInstallationPlatform = pgtype.Text{String: metadata.Platform, Valid: metadata.Platform != ""}
		params.SidekickInstallationVersion = pgtype.Text{String: metadata.Version, Valid: metadata.Version != ""}
	}
	return s.dbFor(ctx).CreateOAuthDeviceSession(ctx, params)
}

func (s *storage) GetDeviceCodeSession(ctx context.Context, signature string, session fosite.Session) (fosite.DeviceRequester, error) {
	row, err := s.dbFor(ctx).GetOAuthDeviceSession(ctx, signature)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fosite.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	decoded, err := decodeRequest(row.Request, session, true)
	if err != nil {
		return nil, err
	}
	request := decoded.(fosite.DeviceRequester)
	if row.Invalidated {
		return request, fosite.ErrInvalidatedDeviceCode
	}
	return request, nil
}

func (s *storage) InvalidateDeviceCodeSession(ctx context.Context, signature string) error {
	rows, err := s.dbFor(ctx).InvalidateOAuthDeviceSession(ctx, signature)
	if err != nil {
		return err
	}
	if rows != 1 {
		return fosite.ErrInvalidatedDeviceCode
	}
	return nil
}

func (s *storage) approveDevice(ctx context.Context, userSignature, subject string, state fosite.UserCodeState, campaign installationCampaign) error {
	row, err := s.dbFor(ctx).GetOAuthDeviceSession(ctx, userSignature)
	if errors.Is(err, pgx.ErrNoRows) {
		return fosite.ErrNotFound
	}
	if err != nil {
		return err
	}
	decoded, err := decodeRequest(row.Request, &fosite.DefaultSession{}, true)
	if err != nil {
		return err
	}
	request := decoded.(fosite.DeviceRequester)
	request.SetUserCodeState(state)
	if state == fosite.UserCodeAccepted {
		request.GetSession().(*fosite.DefaultSession).Subject = subject
	}
	encoded, err := encodeRequest(request)
	if err != nil {
		return err
	}

	metadata := sidekickMetadata{
		ID:       row.SidekickInstallationID.UUID,
		Name:     row.SidekickInstallationName.String,
		Platform: row.SidekickInstallationPlatform.String,
		Version:  row.SidekickInstallationVersion.String,
	}
	hasMetadata := state == fosite.UserCodeAccepted && row.SidekickInstallationID.Valid
	userID, err := uuid.Parse(subject)
	if state == fosite.UserCodeAccepted && err != nil {
		return err
	}

	err = s.db.InTx(ctx, func(tx database.Store) error {
		if hasMetadata {
			if _, err := tx.UpsertSidekickInstallation(ctx, database.UpsertSidekickInstallationParams{
				ID: metadata.ID, UserID: userID, Name: metadata.Name,
				Platform: metadata.Platform, Version: metadata.Version,
			}); err != nil {
				return err
			}
			if campaign.present() {
				if err := tx.SetSidekickInstallationCampaign(ctx, database.SetSidekickInstallationCampaignParams{
					ID: metadata.ID, UserID: userID,
					UtmSource: campaign.Source, UtmMedium: campaign.Medium,
					UtmCampaign: campaign.Campaign, UtmContent: campaign.Content,
				}); err != nil {
					return err
				}
			}
			requestIDs, err := tx.RevokeActiveSidekickOAuthGrants(ctx, metadata.ID)
			if err != nil {
				return err
			}
			for _, requestID := range requestIDs {
				if _, err := tx.DeleteOAuthTokenSessionsByRequestID(ctx, requestID); err != nil {
					return err
				}
			}
			defaultSession := request.GetSession().(*fosite.DefaultSession)
			defaultSession.Username = metadata.ID.String()
			defaultSession.GetExtraClaims()[sidekickSessionExtraKey] = metadata.ID.String()
			encoded, err = encodeRequest(request)
			if err != nil {
				return err
			}
		}
		_, err := tx.UpdateOAuthDeviceSessionByUserSignature(ctx, database.UpdateOAuthDeviceSessionByUserSignatureParams{
			Request: encoded, UserSignature: userSignature,
		})
		return err
	}, nil)
	if errors.Is(err, pgx.ErrNoRows) {
		return fosite.ErrNotFound
	}
	return err
}

func (s *storage) createToken(ctx context.Context, tokenType, signature, accessSignature string, request fosite.Requester) error {
	encoded, err := encodeRequest(request)
	if err != nil {
		return err
	}

	var (
		fositeType fosite.TokenType
		lifespan   time.Duration
	)
	switch tokenType {
	case tokenTypeAccess:
		fositeType, lifespan = fosite.AccessToken, s.accessTokenLifespan
	case tokenTypeRefresh:
		fositeType, lifespan = fosite.RefreshToken, s.refreshTokenLifespan
	default:
		fositeType, lifespan = fosite.AuthorizeCode, s.deviceCodeLifespan
	}
	expiresAt := request.GetSession().GetExpiresAt(fositeType)
	if expiresAt.IsZero() {
		expiresAt = request.GetRequestedAt().Add(lifespan)
	}
	db := s.dbFor(ctx)
	if installationID, ok := sidekickInstallationIDFromSession(request.GetSession()); ok {
		if err := db.InsertSidekickOAuthGrant(ctx, database.InsertSidekickOAuthGrantParams{
			OauthRequestID: request.GetID(), SidekickID: installationID,
		}); err != nil {
			return err
		}
	}
	return db.CreateOAuthTokenSession(ctx, database.CreateOAuthTokenSessionParams{
		TokenType: tokenType, Signature: signature, RequestID: request.GetID(),
		AccessSignature: accessSignature, Request: encoded,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
}

func (s *storage) getToken(ctx context.Context, tokenType, signature string, session fosite.Session) (fosite.Requester, error) {
	encoded, err := s.dbFor(ctx).GetOAuthTokenSession(ctx, database.GetOAuthTokenSessionParams{TokenType: tokenType, Signature: signature})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fosite.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeRequest(encoded, session, false)
}

func (s *storage) deleteToken(ctx context.Context, tokenType, signature string) error {
	_, err := s.dbFor(ctx).DeleteOAuthTokenSession(ctx, database.DeleteOAuthTokenSessionParams{TokenType: tokenType, Signature: signature})
	return err
}

func (s *storage) CreateAccessTokenSession(ctx context.Context, signature string, request fosite.Requester) error {
	return s.createToken(ctx, tokenTypeAccess, signature, "", request)
}
func (s *storage) GetAccessTokenSession(ctx context.Context, signature string, session fosite.Session) (fosite.Requester, error) {
	return s.getToken(ctx, tokenTypeAccess, signature, session)
}
func (s *storage) DeleteAccessTokenSession(ctx context.Context, signature string) error {
	return s.deleteToken(ctx, tokenTypeAccess, signature)
}
func (s *storage) CreateRefreshTokenSession(ctx context.Context, signature, accessSignature string, request fosite.Requester) error {
	return s.createToken(ctx, tokenTypeRefresh, signature, accessSignature, request)
}
func (s *storage) GetRefreshTokenSession(ctx context.Context, signature string, session fosite.Session) (fosite.Requester, error) {
	return s.getToken(ctx, tokenTypeRefresh, signature, session)
}
func (s *storage) DeleteRefreshTokenSession(ctx context.Context, signature string) error {
	return s.deleteToken(ctx, tokenTypeRefresh, signature)
}
func (s *storage) RotateRefreshToken(ctx context.Context, requestID, signature string) error {
	rows, err := s.dbFor(ctx).RotateOAuthRefreshToken(ctx, database.RotateOAuthRefreshTokenParams{RequestID: requestID, RefreshSignature: signature})
	if err != nil {
		return err
	}
	if rows != 1 {
		return fosite.ErrSerializationFailure
	}
	return nil
}
func (s *storage) RevokeRefreshToken(ctx context.Context, requestID string) error {
	_, err := s.dbFor(ctx).RevokeOAuthTokenSessions(ctx, database.RevokeOAuthTokenSessionsParams{RequestID: requestID, TokenType: tokenTypeRefresh})
	return err
}
func (s *storage) RevokeAccessToken(ctx context.Context, requestID string) error {
	_, err := s.dbFor(ctx).RevokeOAuthTokenSessions(ctx, database.RevokeOAuthTokenSessionsParams{RequestID: requestID, TokenType: tokenTypeAccess})
	return err
}
func (s *storage) CreateAuthorizeCodeSession(ctx context.Context, signature string, request fosite.Requester) error {
	return s.createToken(ctx, tokenTypeAuthorize, signature, "", request)
}
func (s *storage) GetAuthorizeCodeSession(ctx context.Context, signature string, session fosite.Session) (fosite.Requester, error) {
	return s.getToken(ctx, tokenTypeAuthorize, signature, session)
}
func (s *storage) InvalidateAuthorizeCodeSession(ctx context.Context, signature string) error {
	return s.deleteToken(ctx, tokenTypeAuthorize, signature)
}
