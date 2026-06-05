package serviceazerothcore

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func actorUUID(r *http.Request) (uuid.NullUUID, bool) {
	actor, ok := authz.ActorFromContext(r.Context())
	if !ok {
		return uuid.NullUUID{}, false
	}
	id, err := uuid.Parse(actor.Object().ID)
	if err != nil {
		return uuid.NullUUID{}, false
	}
	return uuid.NullUUID{UUID: id, Valid: true}, true
}

func nullUUIDPtr(n uuid.NullUUID) *uuid.UUID {
	if !n.Valid {
		return nil
	}
	return &n.UUID
}

func pgtextPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func serverToSDK(s database.WowServer) chroniclesdk.WoWServer {
	return chroniclesdk.WoWServer{
		ID:               s.ID,
		Name:             s.Name,
		Description:      s.Description,
		URL:              pgtextPtr(s.Url),
		CreatedBy:        nullUUIDPtr(s.CreatedBy),
		TenantID:         nullUUIDPtr(s.TenantID),
		DefaultDatasetID: nullUUIDPtr(s.DefaultDatasetID),
	}
}

func realmToSDK(r database.WowServerRealm) chroniclesdk.WoWServerRealm {
	return chroniclesdk.WoWServerRealm{
		ID:          r.ID,
		ServerID:    r.ServerID,
		Name:        r.Name,
		Description: r.Description,
		URL:         pgtextPtr(r.Url),
		CreatedBy:   nullUUIDPtr(r.CreatedBy),
	}
}

// hashToken returns the hex-encoded SHA-256 of a raw token string.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// generateToken creates a cryptographically random 32-byte token and returns
// both the raw hex string and its SHA-256 hash.
func generateToken() (raw string, hash string, err error) {
	b := make([]byte, 32)
	_, err = rand.Read(b)
	if err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b)
	return raw, hashToken(raw), nil
}

// -- Servers --

// canAdministerServer checks if the authenticated user has the administer
// permission on the given wow_server. Returns false and writes an HTTP error
// on failure.
func (h *Handler) canAdministerServer(w http.ResponseWriter, r *http.Request, serverID uuid.UUID) bool {
	ctx := r.Context()
	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, nil)
		return false
	}
	b := policy.New()
	can, err := h.zed.CheckOne(ctx, nil, b.Wow_server(serverID).CanAdminister_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return false
	}
	if !can {
		httpapi.Forbidden(w, nil)
		return false
	}
	return true
}

// canAdministerRealm checks if the authenticated user has the administer
// permission on the given wow_server_realm. Since realm#administer =
// wow_server->administer, we look up the realm's server and check there.
func (h *Handler) canAdministerRealm(w http.ResponseWriter, r *http.Request, realmID uuid.UUID) bool {
	ctx := r.Context()
	bypassCtx := servicetenant.AdminBypass(ctx)
	realm, err := h.zed.GetWoWServerRealm(bypassCtx, realmID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Realm not found",
		})
		return false
	}
	return h.canAdministerServer(w, r, realm.ServerID)
}

func (h *Handler) ListServers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Bypass tenant RLS so admins can see servers across all tenants.
	// Authorization is enforced by SpiceDB's LookupResources below.
	ctx = servicetenant.AdminBypass(ctx)
	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, nil)
		return
	}

	// Ask SpiceDB for all wow_server IDs this user can administer.
	obj := actor.Object()
	subject := obj.Typ + ":" + obj.ID // e.g. "user:<uuid>"

	var resp []chroniclesdk.WoWServer
	for id, err := range h.zed.LookupResources(ctx, nil, "wow_server#administer", subject) {
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		sid, parseErr := uuid.Parse(id)
		if parseErr != nil {
			continue
		}
		s, dbErr := h.zed.GetWoWServer(ctx, sid)
		if dbErr != nil {
			continue // deleted between lookup and fetch
		}
		resp = append(resp, serverToSDK(s))
	}
	if resp == nil {
		resp = []chroniclesdk.WoWServer{}
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (h *Handler) CreateServer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Creating a server requires global admin_servers permission.
	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, nil)
		return
	}
	b := policy.New()
	can, err := h.zed.CheckOne(ctx, nil, b.GlobalChronicle().CanAdmin_servers_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !can {
		httpapi.Forbidden(w, nil)
		return
	}

	var req chroniclesdk.CreateWoWServerRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Name == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "name is required",
		})
		return
	}

	var urlText pgtype.Text
	if req.URL != nil {
		urlText = pgtype.Text{String: *req.URL, Valid: true}
	}

	createdBy, _ := actorUUID(r)

	server, err := h.zed.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
		Url:         urlText,
		CreatedBy:   createdBy,
	})
	if err != nil {
		if database.IsUniqueViolation(err) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "server name already exists",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, serverToSDK(server))
}

func (h *Handler) DeleteServer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	serverID, err := uuid.Parse(chi.URLParam(r, "serverID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "invalid server ID",
		})
		return
	}

	if !h.canAdministerServer(w, r, serverID) {
		return
	}

	if err := h.zed.DeleteWoWServer(ctx, serverID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// -- Realms --

func (h *Handler) ListRealms(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	serverID, err := uuid.Parse(chi.URLParam(r, "serverID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "invalid server ID",
		})
		return
	}

	if !h.canAdministerServer(w, r, serverID) {
		return
	}

	// Bypass tenant RLS so admins can see realms for cross-tenant servers.
	// Authorization was already checked by canAdministerServer above.
	ctx = servicetenant.AdminBypass(ctx)
	realms, err := h.zed.ListWoWServerRealms(ctx, serverID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := make([]chroniclesdk.WoWServerRealm, 0, len(realms))
	for _, rlm := range realms {
		resp = append(resp, realmToSDK(rlm))
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (h *Handler) CreateRealm(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	serverID, err := uuid.Parse(chi.URLParam(r, "serverID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "invalid server ID",
		})
		return
	}

	if !h.canAdministerServer(w, r, serverID) {
		return
	}

	var req chroniclesdk.CreateWoWServerRealmRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Name == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "name is required",
		})
		return
	}

	createdBy, _ := actorUUID(r)

	var urlText pgtype.Text
	if req.URL != nil {
		urlText = pgtype.Text{String: *req.URL, Valid: true}
	}

	realm, err := h.zed.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:          uuid.New(),
		ServerID:    serverID,
		Name:        req.Name,
		Description: req.Description,
		Url:         urlText,
		CreatedBy:   createdBy,
	})
	if err != nil {
		if database.IsUniqueViolation(err) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "realm name already exists",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, realmToSDK(realm))
}

func (h *Handler) DeleteRealm(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	realmID, err := uuid.Parse(chi.URLParam(r, "realmID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "invalid realm ID",
		})
		return
	}

	if !h.canAdministerRealm(w, r, realmID) {
		return
	}

	if err := h.zed.DeleteWoWServerRealm(ctx, realmID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// -- Upload Keys --

func (h *Handler) ListUploadKeys(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	realmID, err := uuid.Parse(chi.URLParam(r, "realmID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "invalid realm ID",
		})
		return
	}

	if !h.canAdministerRealm(w, r, realmID) {
		return
	}

	keys, err := h.zed.ListUploadKeysByRealm(ctx, realmID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := make([]chroniclesdk.UploadKey, 0, len(keys))
	for _, k := range keys {
		uk := chroniclesdk.UploadKey{
			ID:          k.ID,
			RealmID:     k.RealmID,
			Description: k.Description,
			CreatedAt:   k.CreatedAt.Time,
			CreatedBy:   nullUUIDPtr(k.CreatedBy),
		}
		if k.LastUsedAt.Valid {
			t := k.LastUsedAt.Time
			uk.LastUsedAt = &t
		}
		resp = append(resp, uk)
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (h *Handler) CreateUploadKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	realmID, err := uuid.Parse(chi.URLParam(r, "realmID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "invalid realm ID",
		})
		return
	}

	if !h.canAdministerRealm(w, r, realmID) {
		return
	}

	var req chroniclesdk.CreateUploadKeyRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	createdBy, _ := actorUUID(r)

	rawToken, tokenHash, err := generateToken()
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	keyID := uuid.New()
	key, err := h.zed.InsertUploadKey(ctx, database.InsertUploadKeyParams{
		ID:          keyID,
		RealmID:     realmID,
		SecretHash:  tokenHash,
		Description: req.Description,
		CreatedBy:   createdBy,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.UploadKey{
		ID:          key.ID,
		RealmID:     key.RealmID,
		Description: key.Description,
		CreatedAt:   key.CreatedAt.Time,
		CreatedBy:   nullUUIDPtr(key.CreatedBy),
		Secret:      rawToken,
	})
}

func (h *Handler) DeleteUploadKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	keyID, err := uuid.Parse(chi.URLParam(r, "keyID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "invalid key ID",
		})
		return
	}

	key, err := h.zed.GetUploadKey(ctx, keyID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Upload key not found",
		})
		return
	}

	if !h.canAdministerRealm(w, r, key.RealmID) {
		return
	}

	if err := h.zed.DeleteUploadKey(ctx, keyID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
