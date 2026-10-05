---
name: http-api-patterns
description: |
  Chronicle HTTP API conventions using go-chi router. Covers request/response handling
  with httpapi helpers, JWT authentication via chronauth, SDK type definitions that
  auto-generate TypeScript, and database-to-SDK conversion patterns. Essential for
  adding or modifying API endpoints.
---

# HTTP API Patterns

## When to Use This Skill

Use this skill when:
- Adding new API endpoints
- Modifying existing HTTP handlers
- Working with authentication/authorization
- Adding new SDK types that need TypeScript generation
- Converting database models to API responses

## Key Files

| Path | Purpose |
|------|---------|
| `api/api.go` | Route definitions, middleware setup |
| `api/httpapi/httpapi.go` | `Write`, `Read`, `InternalServerError` helpers |
| `api/chronauth/` | OAuth flow, JWT sessions, claims |
| `api/httpmw/` | Middleware (auth, prometheus, recover) |
| `api/chroniclesdk/` | SDK types (generates TypeScript) |
| `api/db2sdk/convert.go` | Database → SDK conversion functions |
| `scripts/apitypings/main.go` | TypeScript type generator |

## Adding a New Endpoint (Workflow)

### 1. Define SDK Types

Add request/response types in `api/chroniclesdk/`:

```go
// api/chroniclesdk/example.go
package chroniclesdk

type CreateExampleRequest struct {
    Name        string `json:"name"`
    Description string `json:"description,omitempty"`
}

type ExampleResponse struct {
    ID        uuid.UUID `json:"id"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"created_at"`
}
```

### 2. Create the Handler

Add handler method in `api/`:

```go
// api/example.go
package api

import (
    "net/http"
    
    "github.com/Emyrk/chronicle/api/chronauth"
    "github.com/Emyrk/chronicle/api/chroniclesdk"
    "github.com/Emyrk/chronicle/api/httpapi"
)

// CreateExample creates a new example resource.
// @Summary Create example
// @Tags Examples
// @Param request body chroniclesdk.CreateExampleRequest true "Example details"
// @Success 201 {object} chroniclesdk.ExampleResponse
// @Router /api/v1/examples [post]
func (a *API) CreateExample(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    
    // Parse request body
    var req chroniclesdk.CreateExampleRequest
    if !httpapi.Read(ctx, w, r, &req) {
        return // Read already wrote the error response
    }
    
    // Get authenticated user (if route requires auth)
    claims := chronauth.MustAuthenticatedClaims(ctx)
    userID := claims.Subject
    
    // Business logic...
    result, err := a.Opts.DB.CreateExample(ctx, database.CreateExampleParams{
        Name:   req.Name,
        Owner:  userID,
    })
    if err != nil {
        httpapi.InternalServerError(w, err)
        return
    }
    
    // Return response
    httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.ExampleResponse{
        ID:        result.ID,
        Name:      result.Name,
        CreatedAt: result.CreatedAt.Time,
    })
}
```

### 3. Register the Route

Add to `api/api.go` in the `Routes()` method:

```go
r.Route("/api/v1", func(r chi.Router) {
    r.Use(api.Auth.AuthenticationMiddleware)
    
    // Public routes (no auth required)
    r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
        httpapi.Write(r.Context(), w, http.StatusOK, "OK")
    })
    
    // Authenticated routes
    r.Group(func(r chi.Router) {
        r.Use(api.Auth.Authenticated(false)) // false = auth required
        r.Post("/examples", api.CreateExample)
    })
    
    // Routes with specific permissions
    r.Group(func(r chi.Router) {
        r.Use(
            api.Auth.Authenticated(false),
            httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User),
        )
        r.Get("/admin/examples", api.AdminListExamples)
    })
})
```

### 4. Generate TypeScript Types

```bash
make gen
# Or specifically:
go run -C ./scripts/apitypings main.go > frontend/chronicle/src/api/typesGenerated.ts
```

## Request/Response Handling

### Writing Responses

Always use `httpapi.Write` for JSON responses:

```go
// Success response with data
httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.SomeResponse{...})

// Success with no content
httpapi.Write(ctx, w, http.StatusNoContent, nil)

// Error response with message
httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
    Message: "Invalid request parameters.",
    Detail:  err.Error(),
})

// Internal server error (logs error details)
httpapi.InternalServerError(w, err)

// Forbidden (permission denied)
httpapi.Forbidden(w, err)
```

### Reading Request Bodies

Use `httpapi.Read` which handles JSON parsing and error responses:

```go
var req chroniclesdk.SomeRequest
if !httpapi.Read(ctx, w, r, &req) {
    return // Read already wrote 400 Bad Request
}
// req is now populated
```

### Response Type

The standard error response type:

```go
type Response struct {
    Message      string `json:"message"`       // User-facing message
    CallToAction string `json:"call_to_action,omitempty"` // Suggested next step
    Link         string `json:"link,omitempty"`           // Action URL
    LinkText     string `json:"link_text,omitempty"`
    Detail       string `json:"detail,omitempty"`         // Debug info
}
```

## Authentication

### Middleware Chain

```go
r.Route("/api/v1", func(r chi.Router) {
    // 1. Always run auth middleware first (populates context)
    r.Use(api.Auth.AuthenticationMiddleware)
    
    r.Group(func(r chi.Router) {
        // 2. Require authentication (false = required, true = optional)
        r.Use(api.Auth.Authenticated(false))
        
        // 3. Optional: require specific permission
        r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanUpload_log_User))
        
        r.Post("/upload", api.Upload)
    })
})
```

### Accessing Claims in Handlers

```go
// Option 1: Must be authenticated (panics if not)
claims := chronauth.MustAuthenticatedClaims(ctx)
userID := claims.Subject

// Option 2: Check if authenticated
claims, ok := chronauth.AuthenticatedClaims(ctx)
if !ok {
    // Handle unauthenticated request
}

// Option 3: Get full auth state (includes error info)
state := chronauth.AuthenticationState(r)
if state.Error != nil {
    // Handle auth error
}
```

### Claims Structure

```go
type Claims struct {
    Subject    uuid.UUID // User ID
    SessionID  uuid.UUID // Session ID (static between refreshes)
    UserAuthID uuid.UUID // OAuth link ID
    Provider   string    // "discord", etc.
    Expiry     *jwt.NumericDate
    // ...
}
```

### Permission Checks

Use `httpmw.Can` middleware or manual checks:

```go
// Middleware approach (recommended for route-level)
r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User))

// Manual check in handler
actor, _ := authz.ActorFromContext(ctx)
can, err := a.Zed.CheckOne(ctx, nil, 
    policy.New().GlobalChronicle().CanSet_user_data_limit_User(actor))
if err != nil || !can {
    httpapi.Forbidden(w, err)
    return
}
```

## SDK Types and TypeScript Generation

### SDK Type Guidelines

1. **JSON tags required** - all exported fields need `json:"field_name"`
2. **Use `omitempty`** for optional fields
3. **Use primitive types** - avoid complex nested types when possible
4. **Add to chroniclesdk package** - not scattered across other packages

```go
// api/chroniclesdk/log.go
type WoWLogGroup struct {
    ID               uuid.UUID    `json:"id"`
    Owner            uuid.UUID    `json:"owner"`
    CreatedAt        time.Time    `json:"created_at"`
    Files            []WoWLogFile `json:"files"`
    ProcessingOutput *string      `json:"processing_output,omitempty"`
}
```

### TypeScript Generator

The generator at `scripts/apitypings/main.go`:
- Uses `github.com/coder/guts` to parse Go types
- Generates types from `api/chroniclesdk` package
- Maps special types (uuid.UUID → string, time.Time → string)
- Outputs to `frontend/chronicle/src/api/typesGenerated.ts`

Custom type mappings:

```go
// In scripts/apitypings/main.go
gen.IncludeCustom(map[string]string{
    "github.com/google/uuid.UUID":                        "string",
    "github.com/jackc/pgx/v5/pgtype.Timestamptz":         "string",
    "github.com/Emyrk/chronicle/api/chroniclesdk.GUIDString": "string",
})
```

### Regenerating Types

```bash
make gen  # Regenerates all (database, TypeScript, etc.)
```

## Database to SDK Conversion

Use `api/db2sdk/convert.go` for converting database models:

```go
// api/db2sdk/convert.go
func User(user database.ChronicleUser, roles []string) chroniclesdk.User {
    return chroniclesdk.User{
        ID:                   user.ID,
        Username:             user.Username,
        Email:                user.Email,
        Roles:                roles,
        CreatedAt:            user.CreatedAt.Time,
        UpdatedAt:            user.UpdatedAt.Time,
        MaxStorageBytes:      user.MaxStorageBytes.Int64,
        ConsumedStorageBytes: user.ConsumedStorageBytes,
    }
}
```

Usage in handlers:

```go
user, err := a.Opts.DB.GetUserByID(ctx, userID)
if err != nil {
    httpapi.InternalServerError(w, err)
    return
}

roles, err := a.Opts.Zed.UserChronicleRoles(ctx, userID)
if err != nil {
    httpapi.InternalServerError(w, err)
    return
}

httpapi.Write(ctx, w, http.StatusOK, db2sdk.User(user, roles))
```

## URL Parameters

### Path Parameters

Use `chi.URLParam`:

```go
// Route: /api/v1/users/{userID}
userIDStr := chi.URLParam(r, "userID")
userID, err := uuid.Parse(userIDStr)
if err != nil {
    httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
        Message: "Invalid user ID",
        Detail:  err.Error(),
    })
    return
}
```

### Middleware for Common Parameters

```go
// api/httpmw/logid.go - extracts and validates log ID
func LogIDMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Parse and validate, store in context
        next.ServeHTTP(w, r)
    })
}

// Usage in routes
r.Route("/{logID}", func(r chi.Router) {
    r.Use(httpmw.LogIDMiddleware)
    r.Get("/", api.GetLog)
})
```

## Anti-Patterns

### ❌ Don't Use `http.Error` Directly

```go
// Bad - breaks JSON response contract
http.Error(w, "something went wrong", http.StatusInternalServerError)

// Good - maintains JSON responses
httpapi.InternalServerError(w, err)
```

### ❌ Don't Return Raw Maps

```go
// Bad - no type safety, no TypeScript generation
httpapi.Write(ctx, w, http.StatusOK, map[string]string{
    "message": "Success",
})

// Good - use SDK types
httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
    Message: "Success",
})
```

### ❌ Don't Forget Error Handling After Read

```go
// Bad - continues after read failure
httpapi.Read(ctx, w, r, &req)
// ... continues even if Read returned false

// Good - return early on failure
if !httpapi.Read(ctx, w, r, &req) {
    return
}
```

### ❌ Don't Mix Auth Patterns

```go
// Bad - inconsistent auth checking
if state.Claims == nil {
    http.Error(w, "unauthorized", 401)
    return
}

// Good - use the helpers
claims := chronauth.MustAuthenticatedClaims(ctx)
// or
claims, ok := chronauth.AuthenticatedClaims(ctx)
```

### ❌ Don't Skip db2sdk for Complex Types

```go
// Bad - manual conversion duplicates logic
httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.User{
    ID: user.ID,
    // ... manually copying all fields
})

// Good - use conversion functions
httpapi.Write(ctx, w, http.StatusOK, db2sdk.User(user, roles))
```

## Testing

See `internal/testutil/` for test helpers:

```go
func TestCreateExample(t *testing.T) {
    t.Parallel()
    ctx := testutil.Context(t, testutil.WaitShort)
    
    db, _ := dbtestutil.NewDB(t)
    api, err := api.New(ctx, api.Options{
        DB: db,
        // ...
    })
    require.NoError(t, err)
    
    // Test handler with httptest
    req := httptest.NewRequest("POST", "/api/v1/examples", 
        strings.NewReader(`{"name":"test"}`))
    rec := httptest.NewRecorder()
    
    api.Routes().ServeHTTP(rec, req)
    
    require.Equal(t, http.StatusCreated, rec.Code)
}
```
