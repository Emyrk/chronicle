package cli

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"

	"github.com/Emyrk/chronicle/golang/internal/version"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"

	"github.com/coder/serpent"
)

func RootCmd() *serpent.Command {
	cmd := &serpent.Command{
		Use:     "chronicle",
		Handler: serpent.DefaultHelpFn(),
	}

	cmd.AddSubcommands(
		versionCmd(),
		MergeCmd(),
		ParseCmd(),
		GuidCmd(),
	)

	return cmd
}

func versionCmd() *serpent.Command {
	return &serpent.Command{
		Use:   "version",
		Short: "Print the version information",
		Handler: func(i *serpent.Invocation) error {
			fmt.Printf("Git Tag: %s\n", version.GitTag)
			fmt.Printf("Git Commit: %s\n", version.GitCommit)
			fmt.Printf("Build Time: %s\n", version.BuildTime)
			return nil
		},
	}
}

func getLogger(i *serpent.Invocation) *slog.Logger {
	var out io.Writer = zerolog.ConsoleWriter{Out: os.Stderr}
	if ok, _ := strconv.ParseBool(os.Getenv("CHRONICLE_JSON_LOGS")); ok {
		out = os.Stderr
	}

	zl := zerolog.New(out)
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zl}.NewZerologHandler())
	return logger.With(slog.String("deployment_id", uuid.NewString()))
}
