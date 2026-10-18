package authz

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/google/uuid"
)

// AuthzMigration is a numbered authz schema migration.
// Append new migrations to the migrations slice with the next version number.
type AuthzMigration struct {
	Version int32
	Run     func(ctx context.Context, az *Authz) error
}

// migrations is the ordered list of authz migrations.
// To add a new migration, append an entry with the next version number.
var migrations = []AuthzMigration{
	{Version: 1, Run: migration001},
	{Version: 2, Run: migration002},
	{Version: 3, Run: migration003},
	{Version: 4, Run: migration004},
	{Version: 5, Run: noop},
}

// RunSchemaMigrations runs any authz migrations not yet recorded in the
// authz_schema_migrations table.
func RunSchemaMigrations(ctx context.Context, az *Authz) error {
	applied, err := az.db.GetAppliedAuthzMigrations(ctx)
	if err != nil {
		return fmt.Errorf("get applied authz migrations: %w", err)
	}

	appliedSet := make(map[int32]bool, len(applied))
	for _, v := range applied {
		appliedSet[v] = true
	}

	for _, m := range migrations {
		if appliedSet[m.Version] {
			continue
		}
		if err := m.Run(ctx, az); err != nil {
			return fmt.Errorf("authz migration %d: %w", m.Version, err)
		}
		if err := az.db.RecordAuthzMigration(ctx, m.Version); err != nil {
			return fmt.Errorf("record authz migration %d: %w", m.Version, err)
		}
	}
	return nil
}

func noop(ctx context.Context, az *Authz) error {
	return nil
}

// migration001 seeds servers and realms (originally from RunSchemaMigrations).
func migration001(ctx context.Context, az *Authz) error {
	b := policy.New()
	chron := b.GlobalChronicle()

	// Servers (from migrations 000002, 000030, 000080)
	turtleWow := uuid.MustParse("10ac9e23-ff74-43ed-83ad-96c123017097")
	unknown := uuid.MustParse("89b9a047-71c7-4f0d-96a0-247308a81f90")
	epoch := uuid.MustParse("2f7e2ccc-9aa2-4b48-8ee9-b146a9138d06")

	b.Wow_server(turtleWow).Chronicle(chron)
	b.Wow_server(unknown).Chronicle(chron)
	b.Wow_server(epoch).Chronicle(chron)

	// Realms — turtle-wow
	b.Wow_server_realm(uuid.MustParse("851d2fd3-f9c5-4623-b714-924b59d916aa")).
		Wow_server(b.Wow_server(turtleWow))
	b.Wow_server_realm(uuid.MustParse("f94d3103-1cd8-40e9-ad91-a2366de33354")).
		Wow_server(b.Wow_server(turtleWow))
	b.Wow_server_realm(uuid.MustParse("bcf173a7-c94a-49fe-8930-27435d722fb7")).
		Wow_server(b.Wow_server(turtleWow))

	// Realms — unknown
	b.Wow_server_realm(uuid.MustParse("f6fb8310-9464-4cf1-a143-aba34f1c3037")).
		Wow_server(b.Wow_server(unknown))

	// Realms — epoch
	b.Wow_server_realm(uuid.MustParse("e9c0f97b-0b2e-4f47-848c-68634ba6a3dd")).
		Wow_server(b.Wow_server(epoch))
	b.Wow_server_realm(uuid.MustParse("140eaa55-317d-4299-8756-83f495efba15")).
		Wow_server(b.Wow_server(epoch))

	// TOUCH is idempotent — safe to run on every startup.
	_, err := az.Write(ctx, *b.Txn())
	return err
}

// migration002 seeds servers and realms
func migration002(ctx context.Context, az *Authz) error {
	b := policy.New()
	chron := b.GlobalChronicle()

	turtlesa := uuid.MustParse("eaa7e20e-ae86-4690-98e0-dde0b9f06cd0")
	turtleasia := uuid.MustParse("9750514d-be08-4700-bce7-4108916b7ea0")

	b.Wow_server(turtlesa).Chronicle(chron)
	b.Wow_server(turtleasia).Chronicle(chron)

	// Realms — turtle-wow
	b.Wow_server_realm(uuid.MustParse("ad486d39-31dd-4eb6-a43d-7d469df4ffcf")).
		Wow_server(b.Wow_server(turtlesa)) // South Seas

	// Realms — turtle-asia
	b.Wow_server_realm(uuid.MustParse("c240e1e4-9d2b-46f7-b23c-6b55a37b4710")).
		Wow_server(b.Wow_server(turtleasia))
	b.Wow_server_realm(uuid.MustParse("885cd224-aa71-4592-81e2-98fe138ca650")).
		Wow_server(b.Wow_server(turtleasia))
	b.Wow_server_realm(uuid.MustParse("0f9825e5-8a88-4bfb-80f6-26b472c7a1aa")).
		Wow_server(b.Wow_server(turtleasia))
	b.Wow_server_realm(uuid.MustParse("5f786828-1c60-4360-8b0f-14b7b494be3a")).
		Wow_server(b.Wow_server(turtleasia))

	// TOUCH is idempotent — safe to run on every startup.
	_, err := az.Write(ctx, *b.Txn())
	return err
}

// migration003 something is still off. Not all realms and servers are available
func migration003(ctx context.Context, az *Authz) error {
	b := policy.New()
	chron := b.GlobalChronicle()

	realms, err := az.ListAllWoWServerRealms(ctx)
	if err != nil {
		return fmt.Errorf("list realms: %w", err)
	}

	servers := make(map[uuid.UUID]*policy.ObjWow_server)

	for _, r := range realms {
		srv, exists := servers[r.ServerID]
		if !exists {
			srv = b.Wow_server(r.ServerID)
			srv.Chronicle(chron)
			servers[r.ServerID] = srv
		}

		realm := b.Wow_server_realm(r.ID)
		realm.Wow_server(srv)
	}

	// TOUCH is idempotent — safe to run on every startup.
	_, err = az.Write(ctx, *b.Txn())
	return err
}

func migration004(ctx context.Context, az *Authz) error {
	b := policy.New()
	chron := b.GlobalChronicle()

	tnts, err := az.ListTenants(ctx)
	if err != nil {
		return fmt.Errorf("list tenants: %w", err)
	}

	for _, tnt := range tnts {
		b.Wow_tenant(tnt.ID).Chronicle(chron)
	}

	apps, err := az.ListServerApplications(ctx)
	if err != nil {
		return fmt.Errorf("list server applications: %w", err)
	}

	for _, app := range apps {
		appObj := b.Wow_tenant_application(app.ID)
		appObj.Wow_tenant(b.Wow_tenant(app.TenantID))
	}

	// TOUCH is idempotent — safe to run on every startup.
	_, err = az.Write(ctx, *b.Txn())
	return err
}
