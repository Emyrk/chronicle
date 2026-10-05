---
name: database-sqlc-patterns
description: >
  Database patterns for Chronicle using PostgreSQL and sqlc. Covers query 
  writing conventions, migration workflow, custom type overrides, batch 
  operations, and testing with dbtestutil. Essential for any database schema 
  or query changes.
---

# Database & sqlc Patterns

## When to Use This Skill

Use this skill when you need to:
- Add or modify database queries
- Create new migrations (schema changes)
- Understand custom type mappings (UUID, GUID, JSONB)
- Write tests that require a database
- Debug sqlc code generation issues

## Directory Structure

```
database/
├── sqlc.yaml           # sqlc configuration
├── queries/            # SQL query files (input to sqlc)
│   ├── users.sql
│   ├── file.sql
│   ├── parsedlogs.sql
│   └── ...
├── migrations/         # Schema migrations (numbered)
│   ├── 000001_init.up.sql
│   ├── 000001_init.down.sql
│   └── create_migration.sh
├── generate.sh         # Custom sqlc output merging script
├── dump.sql            # Auto-generated schema dump (for sqlc)
├── dbtestutil/         # Test helpers for Postgres
├── querier.go          # Generated interface (sqlcQuerier)
├── models.go           # Generated model structs
├── queries.sql.go      # Generated query implementations
└── db.go               # Store interface and connection logic
```

## Adding a New Query (Workflow)

### Step 1: Write the SQL Query

Create or edit a file in `database/queries/`. Use sqlc comment syntax:

```sql
-- name: FunctionName :one
SELECT * FROM users WHERE id = $1;

-- name: ListUsers :many
SELECT * FROM users ORDER BY created_at DESC;

-- name: InsertUser :one
INSERT INTO users (id, username, email)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpdateUser :exec
UPDATE users SET username = $2 WHERE id = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;
```

### Step 2: Query Return Type Annotations

| Annotation   | Returns                    | Use Case                        |
|--------------|----------------------------|---------------------------------|
| `:one`       | Single row (error if none) | Get by ID, insert returning     |
| `:many`      | Slice of rows              | List queries                    |
| `:exec`      | Error only                 | Updates, deletes                |
| `:batchexec` | Batch results              | Bulk inserts (see below)        |

### Step 3: Generate Code

```bash
make gen/db
```

This runs `database/generate.sh` which:
1. Dumps the current schema to `dump.sql`
2. Runs `sqlc generate`
3. Merges multiple `*.sql.go` files into single `queries.sql.go`
4. Renames `Querier` → `sqlcQuerier` and `Queries` → `sqlQuerier`
5. Runs `goimports` to fix imports

### Step 4: Use the Generated Method

```go
func (api *API) GetUser(w http.ResponseWriter, r *http.Request) {
    userID := chi.URLParam(r, "userID")
    id, _ := uuid.Parse(userID)
    
    user, err := api.db.GetUserByID(r.Context(), id)
    if errors.Is(err, pgx.ErrNoRows) {
        httpapi.Write(r.Context(), w, http.StatusNotFound, ...)
        return
    }
    // ...
}
```

## Query Naming Conventions

Follow these patterns for consistency with existing code:

| Pattern              | Example                          | Description                    |
|----------------------|----------------------------------|--------------------------------|
| `Get<Entity>ByID`    | `GetUserByID`                    | Single entity by primary key   |
| `Get<Entity>By<X>`   | `GetUserAuthByLinkedID`          | Single entity by other column  |
| `List<Entities>`     | `ListAllUsers`                   | All entities                   |
| `List<Entities>By<X>`| `ListRecentInstancesByPlayer`    | Filtered list                  |
| `Insert<Entity>`     | `InsertUser`, `InsertLogFile`    | Create new row                 |
| `Update<Entity><X>`  | `UpdateUserAuthSessionTokens`    | Update specific fields         |
| `Delete<Entity>`     | `DeleteWoWLogGroup`              | Delete row                     |
| `<Entity>sByX`       | `EncountersByInstanceID`         | List related entities          |
| `Upsert<Entity>`     | `UpsertGuild`                    | Insert or update               |

## Creating Migrations

### Step 1: Create Migration Files

```bash
./database/migrations/create_migration.sh "add user roles"
```

This creates:
- `database/migrations/000012_add_user_roles.up.sql`
- `database/migrations/000012_add_user_roles.down.sql`

### Step 2: Write the Migration

**up.sql** (apply changes):
```sql
BEGIN;

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

CREATE INDEX users_role_idx ON users(role);

COMMIT;
```

**down.sql** (rollback changes):
```sql
BEGIN;

DROP INDEX users_role_idx;

ALTER TABLE users DROP COLUMN role;

COMMIT;
```

### Step 3: Regenerate

```bash
make gen
```

This updates `dump.sql` and regenerates all sqlc code.

### Migration Best Practices

- Always wrap in `BEGIN;` / `COMMIT;`
- Write reversible migrations when possible
- Use `IF EXISTS` / `IF NOT EXISTS` for safety
- Add indexes for columns used in WHERE clauses
- Consider data migration for existing rows

## Custom Type Overrides (sqlc.yaml)

Chronicle uses custom type mappings in `database/sqlc.yaml`:

### UUID Types

```yaml
overrides:
  # Non-nullable UUID → uuid.UUID
  - db_type: "uuid"
    go_type: "github.com/google/uuid.UUID"
  
  # Nullable UUID → uuid.NullUUID
  - db_type: "uuid"
    go_type: "github.com/google/uuid.NullUUID"
    nullable: true
```

### Custom Domain Types

```yaml
overrides:
  # WoW GUID (custom domain in Postgres)
  - db_type: "wow_guid"
    go_type: "github.com/Emyrk/chronicle/combatlog/parser/guid.GUID"
  
  - db_type: "wow_guid"
    go_type: "*github.com/Emyrk/chronicle/combatlog/parser/guid.GUID"
    nullable: true
```

### JSONB Aggregations

```yaml
overrides:
  # Custom JSONB domain for file arrays
  - db_type: "wow_log_group_files"
    go_type:
      type: "[]LogFile"
  
  # JSONB column with specific type
  - column: "log_instance_youtube_timestamped.payload"
    go_type:
      type: "[]VideoTimestamp"
```

### Column-Specific Overrides

```yaml
overrides:
  # Override specific column to use custom Go type
  - column: "log_instance_encounter_damage_unit_summary.damage_done_abilities"
    go_type:
      type: "map[guid.GUID]map[string]Ability"
```

## Batch Operations

Use `:batchexec` for efficient bulk inserts:

```sql
-- name: InsertInstancePlayers :batchexec
INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race, guild_id)
VALUES ($1, $2, $3, $4, $5, $6, $7);
```

Usage in Go:

```go
params := make([]database.InsertInstancePlayersParams, len(players))
for i, p := range players {
    params[i] = database.InsertInstancePlayersParams{
        InstanceID: instanceID,
        UnitGuid:   p.GUID,
        Name:       p.Name,
        // ...
    }
}

batchResults := db.InsertInstancePlayers(ctx, params)
defer batchResults.Close()

// Check for errors
if err := batchResults.Exec(func(i int, err error) {
    if err != nil {
        // Handle error for row i
    }
}); err != nil {
    return err
}
```

## Named Parameters

Use `@param_name` syntax for optional/conditional parameters:

```sql
-- name: ListRecentInstances :many
SELECT *
FROM log_instances li
WHERE true
    AND CASE
        WHEN @instance_name :: text != '' THEN
            li.name = @instance_name
        ELSE true
    END
    AND CASE
        WHEN @realm_id :: uuid != '00000000-0000-0000-0000-000000000000'::uuid THEN
            li.realm_id = @realm_id
        ELSE true
    END
LIMIT @limit_count;
```

This generates a struct with named fields:

```go
type ListRecentInstancesParams struct {
    InstanceName string
    RealmID      uuid.UUID
    LimitCount   int32
}
```

## Embedding with sqlc.embed()

For queries joining tables, use `sqlc.embed()` to get typed nested structs:

```sql
-- name: GetWoWLogGroupsByOwner :many
SELECT
  sqlc.embed(wow_log_groups),
  files_agg.files
FROM wow_log_groups
LEFT JOIN LATERAL (...) files_agg ON true
WHERE wow_log_groups.owner = $1;
```

Generates:

```go
type GetWoWLogGroupsByOwnerRow struct {
    WoWLogGroup WoWLogGroup  // Embedded struct
    Files       []LogFile    // Custom type from override
}
```

## Testing with Database

### Basic Test Setup

```go
func TestSomething(t *testing.T) {
    t.Parallel()
    ctx := testutil.Context(t, testutil.WaitShort)
    
    // Creates isolated test database with migrations applied
    db, pubsub := dbtestutil.NewDB(t)
    
    // db is database.Store, pubsub is *pubsub.PGPubsub
    user, err := db.InsertUser(ctx, database.InsertUserParams{...})
    require.NoError(t, err)
}
```

### Test Database Options

```go
// Custom timezone (default: America/St_Johns to catch TZ bugs)
db, _ := dbtestutil.NewDB(t, dbtestutil.WithTimezone("UTC"))

// Dump database on test failure for debugging
db, _ := dbtestutil.NewDB(t, dbtestutil.WithDumpOnFailure())

// Custom connection URL
db, _ := dbtestutil.NewDB(t, dbtestutil.WithURL("postgres://..."))
```

### Running Tests

```bash
# Start Postgres in Docker (required for tests)
make test-postgres-docker

# Run all tests
make test

# Run specific package tests
go test ./database/...
```

### Test Time Helper

```go
// Get current time in test database timezone (for comparison)
now := dbtestutil.NowInDefaultTimezone()
```

## Transactions

Use `InTx` for transactional operations:

```go
err := db.InTx(func(tx database.Store) error {
    user, err := tx.InsertUser(ctx, userParams)
    if err != nil {
        return err
    }
    
    _, err = tx.InsertUserAuth(ctx, database.InsertUserAuthParams{
        UserID: user.ID,
        // ...
    })
    return err
}, nil) // nil uses default transaction options
```

With custom options:

```go
err := db.InTx(func(tx database.Store) error {
    // ...
}, &pgx.TxOptions{
    IsoLevel: pgx.Serializable,
})
```

## Anti-Patterns

### ❌ Don't Write Raw SQL in Go

```go
// BAD: Bypasses sqlc, no type safety
rows, err := pool.Query(ctx, "SELECT * FROM users WHERE id = $1", id)
```

```go
// GOOD: Use generated methods
user, err := db.GetUserByID(ctx, id)
```

### ❌ Don't Forget to Regenerate

After changing queries or migrations, always run:
```bash
make gen/db
```

### ❌ Don't Use `sql.NullString` for UUIDs

```go
// BAD: sqlc.yaml already handles this
var userID sql.NullString
```

```go
// GOOD: Use uuid.NullUUID (configured in sqlc.yaml)
var userID uuid.NullUUID
```

### ❌ Don't Skip Down Migrations

Even if you think you'll never rollback, write down migrations. They're useful for:
- Development iteration
- CI test isolation
- Production incident recovery

### ❌ Don't Modify Generated Files

Never edit these files directly:
- `database/querier.go`
- `database/models.go`
- `database/queries.sql.go`
- `database/batch.go`

They're regenerated on every `make gen/db`.

## Common Errors

### "no rows in result set"

```go
user, err := db.GetUserByID(ctx, id)
if errors.Is(err, pgx.ErrNoRows) {
    // Handle not found
}
```

### "duplicate key value violates unique constraint"

```go
_, err := db.InsertUser(ctx, params)
if database.IsUniqueViolation(err, database.UniqueUsersEmail) {
    // Handle duplicate email
}
```

### sqlc Generation Fails

1. Check SQL syntax in query files
2. Ensure `dump.sql` is up to date: `make database/dump.sql`
3. Check for missing type overrides in `sqlc.yaml`
4. Verify column names match schema exactly
