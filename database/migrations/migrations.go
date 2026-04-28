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
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
	"github.com/riverqueue/river/rivermigrate"
	"golang.org/x/xerrors"
)

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

	err = m.Up()
	if err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			// It's OK if no changes happened!
		} else {
			return fmt.Errorf("up: %w", err)
		}
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
