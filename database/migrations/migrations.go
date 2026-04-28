package migrations

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"sync"

	"github.com/golang-migrate/migrate/v4"
	migratedatabase "github.com/golang-migrate/migrate/v4/database"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
	"github.com/riverqueue/river/rivermigrate"
	"golang.org/x/xerrors"
)

func publicSchemaHasUserTables(db *sql.DB) (bool, error) {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'public'
			  AND table_name <> 'schema_migrations'
		)
	`

	var hasTables bool
	if err := db.QueryRowContext(context.Background(), query).Scan(&hasTables); err != nil {
		return false, fmt.Errorf("check public schema tables: %w", err)
	}

	return hasTables, nil
}

func cleanupInitBootstrapArtifacts(db *sql.DB) error {
	const query = `
		DROP DOMAIN IF EXISTS wow_log_group_files;
		DROP DOMAIN IF EXISTS wow_guid;
		DROP DOMAIN IF EXISTS activity_periods;
	`

	if _, err := db.ExecContext(context.Background(), query); err != nil {
		return fmt.Errorf("cleanup init bootstrap artifacts: %w", err)
	}

	return nil
}

func cleanupParsedLogsBootstrapArtifacts(db *sql.DB) error {
	const query = `
		DROP TABLE IF EXISTS log_instance_players CASCADE;
		DROP TABLE IF EXISTS log_instance_units CASCADE;
		DROP TABLE IF EXISTS log_instance_encounter_damage_unit_summary CASCADE;
		DROP TABLE IF EXISTS log_instance_encounter_hostiles CASCADE;
		DROP TABLE IF EXISTS log_instance_encounters CASCADE;
		DROP TABLE IF EXISTS log_instances CASCADE;
		DROP TABLE IF EXISTS parsed_log_group CASCADE;
		DROP TABLE IF EXISTS wow_server_realms CASCADE;
		DROP TABLE IF EXISTS wow_servers CASCADE;
		DROP TYPE IF EXISTS wow_playable_class CASCADE;
		DROP TYPE IF EXISTS wow_playable_race CASCADE;
	`

	if _, err := db.ExecContext(context.Background(), query); err != nil {
		return fmt.Errorf("cleanup parsed log bootstrap artifacts: %w", err)
	}

	return nil
}

func currentSchemaMigrationState(db *sql.DB) (version int, dirty bool, exists bool, err error) {
	const query = `SELECT version, dirty FROM schema_migrations LIMIT 1`
	if err = db.QueryRowContext(context.Background(), query).Scan(&version, &dirty); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, false, false, nil
		}
		return 0, false, false, fmt.Errorf("read schema_migrations state: %w", err)
	}
	return version, dirty, true, nil
}

func normalizeEmptyBootstrapVersion(db *sql.DB, m *migrate.Migrate) error {
	hasTables, err := publicSchemaHasUserTables(db)
	if err != nil {
		return err
	}
	if hasTables {
		return nil
	}

	if err := cleanupInitBootstrapArtifacts(db); err != nil {
		return err
	}

	version, dirty, exists, err := currentSchemaMigrationState(db)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	if version == 0 && !dirty {
		if forceErr := m.Force(migratedatabase.NilVersion); forceErr != nil {
			return fmt.Errorf("normalize empty bootstrap migration version: %w", forceErr)
		}
	}

	return nil
}

func runUpWithDirtyBootstrapRecovery(db *sql.DB, m *migrate.Migrate) error {
	if err := normalizeEmptyBootstrapVersion(db, m); err != nil {
		return err
	}

	err := m.Up()
	if err == nil || errors.Is(err, migrate.ErrNoChange) {
		return nil
	}

	var dirtyErr migrate.ErrDirty
	if !errors.As(err, &dirtyErr) {
		return fmt.Errorf("up: %w", err)
	}

	if dirtyErr.Version != 1 {
		if dirtyErr.Version == 2 {
			if cleanupErr := cleanupParsedLogsBootstrapArtifacts(db); cleanupErr != nil {
				return cleanupErr
			}
			if forceErr := m.Force(1); forceErr != nil {
				return fmt.Errorf("force migration version 1 after dirty parsed logs bootstrap: %w", forceErr)
			}

			err = m.Up()
			if err != nil && !errors.Is(err, migrate.ErrNoChange) {
				return fmt.Errorf("up after dirty parsed logs bootstrap recovery: %w", err)
			}

			return nil
		}

		return fmt.Errorf("up: %w", err)
	}

	hasTables, checkErr := publicSchemaHasUserTables(db)
	if checkErr != nil {
		return checkErr
	}
	if hasTables {
		return fmt.Errorf("up: %w", err)
	}

	if forceErr := m.Force(migratedatabase.NilVersion); forceErr != nil {
		return fmt.Errorf("force nil migration version after dirty bootstrap: %w", forceErr)
	}

	err = m.Up()
	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("up after dirty bootstrap recovery: %w", err)
	}

	return nil
}

//go:embed *.sql
var migrations embed.FS

func setup(db *sql.DB) (source.Driver, *migrate.Migrate, error) {
	sourceDriver, err := iofs.New(migrations, ".")
	if err != nil {
		return nil, nil, fmt.Errorf("create iofs: %w", err)
	}

	// there is a postgres.WithInstance() method that takes the DB instance,
	// but, when you close the resulting Migrate, it closes the DB, which
	// we don't want.  Instead, create just a connection that will get closed
	// when migration is done.

	dbDriver, err := postgres.WithInstance(db, &postgres.Config{})
	if err != nil {
		return nil, nil, fmt.Errorf("wrap postgres connection: %w", err)
	}

	m, err := migrate.NewWithInstance("", sourceDriver, "", dbDriver)
	if err != nil {
		return nil, nil, fmt.Errorf("new migrate instance: %w", err)
	}

	return sourceDriver, m, nil
}

func UpFromSQLDB(db *sql.DB) (retErr error) {
	_, m, err := setup(db)
	if err != nil {
		return fmt.Errorf("migrate setup: %w", err)
	}
	defer func() {
		srcErr, dbErr := m.Close()
		if retErr != nil {
			return
		}
		if dbErr != nil {
			retErr = dbErr
			return
		}
		retErr = srcErr
	}()

	err = runUpWithDirtyBootstrapRecovery(db, m)
	if err != nil {
		return err
	}

	err = RiverMigrateFromSQLDB(db)
	if err != nil {
		return xerrors.Errorf("river migrate: %w", err)
	}

	return nil
}

func RiverMigrateFromSQLDB(db *sql.DB) error {
	driver := riverdatabasesql.New(db)

	migrator, err := rivermigrate.New(driver, nil)
	if err != nil {
		return xerrors.Errorf("create river sql migrator: %w", err)
	}

	_, err = migrator.Migrate(context.Background(), rivermigrate.DirectionUp, nil)
	if err != nil {
		return xerrors.Errorf("migrate river sql: %w", err)
	}

	return nil
}

func RiverMigrate(pool *pgxpool.Pool) error {
	return RiverMigrateFromSQLDB(stdlib.OpenDBFromPool(pool))
}

// Up runs SQL migrations to ensure the database schema is up-to-date.
func Up(pool *pgxpool.Pool) (retErr error) {
	return UpFromSQLDB(stdlib.OpenDBFromPool(pool))
}

// Down runs all down SQL migrations.
func Down(pool *pgxpool.Pool) error {
	_, m, err := setup(stdlib.OpenDBFromPool(pool))
	if err != nil {
		return xerrors.Errorf("migrate setup: %w", err)
	}
	defer func() {
		_, _ = m.Close()
	}()

	err = m.Down()
	if err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			// It's OK if no changes happened!
			return nil
		}

		return xerrors.Errorf("down: %w", err)
	}

	return nil
}

var (
	migrationsHash     string
	migrationsHashOnce sync.Once
)

// A migrations hash is a sha256 hash of the contents and names
// of the migrations sorted by filename.
func calculateMigrationsHash(migrationsFs embed.FS) (string, error) {
	files, err := migrationsFs.ReadDir(".")
	if err != nil {
		return "", xerrors.Errorf("read migrations directory: %w", err)
	}
	sortedFiles := make([]fs.DirEntry, len(files))
	copy(sortedFiles, files)
	sort.Slice(sortedFiles, func(i, j int) bool {
		return sortedFiles[i].Name() < sortedFiles[j].Name()
	})

	var builder strings.Builder
	for _, file := range sortedFiles {
		if _, err := builder.WriteString(file.Name()); err != nil {
			return "", xerrors.Errorf("write migration file name %q: %w", file.Name(), err)
		}
		content, err := migrationsFs.ReadFile(file.Name())
		if err != nil {
			return "", xerrors.Errorf("read migration file %q: %w", file.Name(), err)
		}
		if _, err := builder.Write(content); err != nil {
			return "", xerrors.Errorf("write migration file content %q: %w", file.Name(), err)
		}
	}

	hash := sha256.New()
	if _, err := hash.Write([]byte(builder.String())); err != nil {
		return "", xerrors.Errorf("write to hash: %w", err)
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

func GetMigrationsHash() string {
	migrationsHashOnce.Do(func() {
		hash, err := calculateMigrationsHash(migrations)
		if err != nil {
			panic(err)
		}
		migrationsHash = hash
	})
	return migrationsHash
}
