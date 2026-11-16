// parser-baseline is temporary, local-only baseline tooling, not a server command.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"runtime/debug"
	"strings"
	"syscall"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type exportRequest struct {
	LogID           uuid.UUID `json:"log_group_id"`
	ParseGeneration int64     `json:"parse_generation"`
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := run(ctx, os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, arguments []string, output io.Writer) error {
	if len(arguments) == 0 || arguments[0] != "export" {
		return errors.New("usage: parser-baseline export --isolated-db --fresh-armory-seed --args args.json --expect-instances N [--provenance FILE]; see README.md")
	}
	flags := flag.NewFlagSet(arguments[0], flag.ContinueOnError)
	argsPath := flags.String("args", "", "JSON export request (explicit log_group_id and parse_generation required)")
	isolated := flags.Bool("isolated-db", false, "confirm disposable, exclusively owned local DB")
	freshArmory := flags.Bool("fresh-armory-seed", false, "attest shared armory tables were empty before this public parse")
	provenancePath := flags.String("provenance", "", "exclusive-create exporter provenance JSON outside the comparable export")
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
	if *provenancePath != "" {
		if err := writeProvenance(*provenancePath, args); err != nil {
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

func readArgs(path string) (exportRequest, error) {
	file, err := os.Open(path)
	if err != nil {
		return exportRequest{}, err
	}
	defer func() { _ = file.Close() }()
	var args exportRequest
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&args); err != nil {
		return args, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return args, errors.New("args file must contain exactly one JSON value")
	}
	if args.LogID == uuid.Nil || args.ParseGeneration < 1 {
		return args, errors.New("explicit log_group_id and positive parse_generation required")
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

// Provenance describes the exporter, not the parser that produced the rows.
// It records an attempt; existence alone does not establish successful export.
func writeProvenance(path string, request exportRequest) error {
	// Standard build metadata is also available when this environment omits Go VCS settings.
	revision, modified := version.GitCommit, "unknown"
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			switch setting.Key {
			case "vcs.revision":
				revision = setting.Value
			case "vcs.modified":
				modified = setting.Value
			}
		}
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("create provenance: %w", err)
	}
	err = json.NewEncoder(file).Encode(struct {
		Request  exportRequest `json:"request"`
		Revision string        `json:"revision"`
		Modified string        `json:"modified"`
	}{request, revision, modified})
	closeErr := file.Close()
	if err != nil {
		return err
	}
	return closeErr
}
