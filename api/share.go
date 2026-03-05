package api

import (
  "crypto/rand"
  "database/sql"
  "encoding/json"
  "errors"
  "net/http"
  "strings"

  "github.com/Emyrk/chronicle/api/chronauth"
  "github.com/Emyrk/chronicle/api/chroniclesdk"
  "github.com/Emyrk/chronicle/api/httpapi"
  "github.com/Emyrk/chronicle/database"
  "github.com/Emyrk/chronicle/database/authz"
  "github.com/Emyrk/chronicle/database/authz/policy"
  "github.com/go-chi/chi/v5"
  "github.com/google/uuid"
  "github.com/jackc/pgx/v5/pgconn"
)

const base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func randomBase62(length int) (string, error) {
  if length <= 0 {
    return "", nil
  }
  buf := make([]byte, length)
  if _, err := rand.Read(buf); err != nil {
    return "", err
  }
  out := make([]byte, length)
  for i := range buf {
    out[i] = base62Alphabet[int(buf[i])%len(base62Alphabet)]
  }
  return string(out), nil
}

func isUniqueViolation(err error) bool {
  var pgErr *pgconn.PgError
  return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func (api *API) getShareCodeLength(ctx context.Context, actor authz.Actor) int {
  ok, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanShorter_urls_User(actor))
  if err != nil || !ok {
    return 8
  }
  return 6
}

func (api *API) CreateShare(w http.ResponseWriter, r *http.Request) {
  ctx := r.Context()
  uc := chronauth.MustAuthenticatedClaims(ctx)
  actor, _ := authz.ActorFromContext(ctx)

  var req chroniclesdk.CreateShareRequest
  if !httpapi.Read(ctx, w, r, &req) {
    return
  }

  if req.InstanceID == uuid.Nil {
    httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_id is required"})
    return
  }
  if len(req.Payload) == 0 || !json.Valid(req.Payload) {
    httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "payload must be valid JSON"})
    return
  }

  codeLength := api.getShareCodeLength(ctx, actor)
  var row database.SharedView
  var err error
  for i := 0; i < 10; i++ {
    code, genErr := randomBase62(codeLength)
    if genErr != nil {
      httpapi.InternalServerError(w, genErr)
      return
    }

    row, err = api.Zed.CreateSharedView(ctx, database.CreateSharedViewParams{
      Code:       code,
      InstanceID: req.InstanceID,
      Payload:    req.Payload,
      CreatedBy:  uuid.NullUUID{UUID: uc.Subject, Valid: true},
    })
    if err == nil {
      break
    }
    if isUniqueViolation(err) {
      continue
    }
    httpapi.InternalServerError(w, err)
    return
  }
  if err != nil {
    httpapi.InternalServerError(w, err)
    return
  }

  httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CreateShareResponse{
    Code: row.Code,
    URL:  "https://chrn.link/" + row.Code,
  })
}

func (api *API) GetShare(w http.ResponseWriter, r *http.Request) {
  ctx := r.Context()
  code := strings.TrimSpace(chi.URLParam(r, "code"))
  if code == "" {
    httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "code is required"})
    return
  }

  row, err := api.Zed.GetSharedViewByCode(ctx, code)
  if err != nil {
    if errors.Is(err, sql.ErrNoRows) {
      httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "share not found"})
      return
    }
    httpapi.InternalServerError(w, err)
    return
  }

  httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.SharedViewResponse{
    InstanceID: row.InstanceID,
    Payload:    row.Payload,
  })
}

func (api *API) shortHostRedirect(w http.ResponseWriter, r *http.Request) {
  code := chi.URLParam(r, "code")
  if code == "" {
    http.NotFound(w, r)
    return
  }
  http.Redirect(w, r, "https://chronicleclassic.com/s/"+code, http.StatusFound)
}

func (api *API) shortLinkRedirectMiddleware(next http.Handler) http.Handler {
  return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    host := r.Host
    if i := strings.IndexByte(host, ':'); i >= 0 {
      host = host[:i]
    }

    if host == "chrn.link" && r.Method == http.MethodGet {
      path := strings.TrimPrefix(r.URL.Path, "/")
      if path != "" && !strings.Contains(path, "/") {
        http.Redirect(w, r, "https://chronicleclassic.com/s/"+path, http.StatusFound)
        return
      }
    }
    next.ServeHTTP(w, r)
  })
}
