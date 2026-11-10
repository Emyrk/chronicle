// parser-baseline is temporary, local-only baseline tooling, not a server command.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := run(ctx, os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, arguments []string, output io.Writer) error {
	if len(arguments) == 0 || (arguments[0] != "run" && arguments[0] != "export") {
		return errors.New("usage: parser-baseline {run|export} --isolated-db --fresh-armory-seed --args args.json --expect-instances N [--storage DIR]; see README.md")
	}
	flags := flag.NewFlagSet(arguments[0], flag.ContinueOnError)
	argsPath := flags.String("args", "", "JSON ArgsLogParse file (explicit log, generation and realm required)")
	storagePath := flags.String("storage", "", "local object-storage root (run only)")
	isolated := flags.Bool("isolated-db", false, "confirm disposable, exclusively owned local DB and local storage")
	freshArmory := flags.Bool("fresh-armory-seed", false, "attest shared armory tables were empty before this public parse")
	expected := flags.Int("expect-instances", 0, "required exact number of published instances")
	if err := flags.Parse(arguments[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 || !*isolated || !*freshArmory || *expected < 1 || *argsPath == "" {
		return errors.New("--isolated-db, --fresh-armory-seed, --args and positive --expect-instances are required; positional arguments are not supported")
	}
	args, err := readArgs(*argsPath)
	if err != nil {
		return err
	}
	dsn := os.Getenv("BASELINE_DATABASE_URL")
	if dsn == "" {
		return errors.New("BASELINE_DATABASE_URL is required; no production/default DSN is used")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return errors.New("invalid BASELINE_DATABASE_URL")
	}
	if err := validateDatabase(config.ConnConfig); err != nil {
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return err
	}
	defer pool.Close()
	store := database.New(pool)
	if arguments[0] == "run" {
		if *storagePath == "" {
			return errors.New("run requires --storage")
		}
		if err := parse(ctx, store, pool, args, *storagePath); err != nil {
			return err
		}
	}
	result, err := export(ctx, store, args.LogID, args.ParseGeneration, *expected)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result)
}

func readArgs(path string) (chronicle.ArgsLogParse, error) {
	file, err := os.Open(path)
	if err != nil {
		return chronicle.ArgsLogParse{}, err
	}
	defer func() { _ = file.Close() }()
	var args chronicle.ArgsLogParse
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&args); err != nil {
		return args, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return args, errors.New("args file must contain exactly one JSON value")
	}
	if args.LogID == uuid.Nil || args.RealmID == uuid.Nil || args.ParseGeneration < 1 {
		return args, errors.New("explicit log_group_id, realm_id and positive parse_generation required")
	}
	return args, nil
}

func validateDatabase(config *pgx.ConnConfig) error {
	if !strings.HasPrefix(config.Database, "parser_baseline_") {
		return errors.New("database name must start with parser_baseline_")
	}
	// Do not resolve arbitrary hostnames or connect to remote databases. Check SSL
	// and multi-host fallbacks too; they must not escape the local-only boundary.
	hosts := []string{config.Host}
	for _, fallback := range config.Fallbacks {
		hosts = append(hosts, fallback.Host)
	}
	for _, host := range hosts {
		ip := net.ParseIP(host)
		if host != "localhost" && !strings.HasPrefix(host, "/") && (ip == nil || !ip.IsLoopback()) {
			return fmt.Errorf("baseline DB must use a loopback host or local Unix socket")
		}
	}
	return nil
}

func parse(ctx context.Context, store database.Store, pool *pgxpool.Pool, args chronicle.ArgsLogParse, storagePath string) error {
	group, err := store.GetWoWLogGroupByID(ctx, args.LogID)
	if err != nil {
		return err
	}
	if group.WoWLogGroup.ParseGeneration != args.ParseGeneration {
		return errors.New("requested generation does not match seeded log group")
	}
	// Fresh seed only. Otherwise a successful no-op could accidentally export old
	// outputs, or a failed parse could leave stale outputs that look like parity.
	_, err = store.GetParsedLogGroupByID(ctx, args.LogID)
	if !errors.Is(err, pgx.ErrNoRows) {
		if err == nil {
			return errors.New("run requires a fresh seed without parsed_log_group output; restore the fixture")
		}
		return err
	}
	if group.WoWLogGroup.Unlisted {
		return errors.New("baseline requires a public log for attributable armory provenance")
	}
	if err := requireEmptyArmory(ctx, store); err != nil {
		return err
	}
	resolved, err := store.ResolveDatasetWithFlavorByRealm(ctx, args.RealmID)
	if err != nil {
		return fmt.Errorf("resolve seeded realm dataset: %w", err)
	}
	local, err := storage.NewLocalStorageAt(storagePath)
	if err != nil {
		return err
	}
	wowDB, err := gamedb.New(ctx, gamedb.Options{DB: store, Pool: pool, DatasetID: resolved.DatasetID, Talents: talents.NewFetcher(store, nil, 1000)})
	if err != nil {
		return err
	}
	defer func() { _ = wowDB.Close() }()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	// Chronicle.New clears its os.TempDir()/chronicle_uploads directory. Give this
	// single-process CLI its own temp root before construction, never the server's.
	temp, err := os.MkdirTemp("", "parser-baseline-")
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(temp) }()
	previous, hadTemp := os.LookupEnv("TMPDIR")
	if err := os.Setenv("TMPDIR", temp); err != nil {
		return err
	}
	defer func() {
		if hadTemp {
			_ = os.Setenv("TMPDIR", previous)
		} else {
			_ = os.Unsetenv("TMPDIR")
		}
	}()
	c, err := chronicle.New(ctx, logger, chronicle.Options{
		Storage: local, Zed: authz.NewDatabaseOnly(logger, store), WoWDB: wowDB,
		DefaultDatasetID: resolved.DatasetID, DefaultFlavor: database.FlavorFromStrings(resolved.DefaultFlavor),
		ResolveDataset: func(context.Context, uuid.UUID) chronicle.ResolvedDataset {
			// RealmID is mandatory in this narrow tool; parsing always uses that realm.
			return chronicle.ResolvedDataset{DatasetID: resolved.DatasetID, Flavor: database.FlavorFromStrings(resolved.DefaultFlavor), AdditionalFlavor: database.FlavorFromStrings(resolved.AdditionalFlavor)}
		},
	})
	if err != nil {
		return err
	}
	return c.RunLogParseBaseline(ctx, args)
}
