package cli

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"runtime/pprof"
	"strconv"

	"github.com/Emyrk/chronicle/internal/version"
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
		ParseV2Cmd(),
		CreaturesCmd(),
		Zoner(),
		RegrowthBug(),
		HitTypeCMD(),
		GuidCmd(),
		SortCmd(),
		ClientFiles(),
		ExtractCmd(),
		HitType(),
		SchoolType(),
		SpellInfo(),
		Stringify(),
		ImportWorldCmd(),
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

func ProfileCommand() (serpent.Option, func(next serpent.HandlerFunc) serpent.HandlerFunc) {
	var profilePath string
	return serpent.Option{
			Name:        "profile-dump",
			Description: "Enable profiling and dump to the specified file.",
			Required:    false,
			Flag:        "profile-dump",
			Default:     "",
			Value:       serpent.StringOf(&profilePath),
		}, func(next serpent.HandlerFunc) serpent.HandlerFunc {
			return func(i *serpent.Invocation) error {
				if profilePath == "" {
					return next(i)
				}

				cpuFile, err := os.Create(profilePath)
				if err != nil {
					return fmt.Errorf("could not create CPU profile: %v", err)
				}

				err = pprof.StartCPUProfile(cpuFile)
				if err != nil {
					return fmt.Errorf("could not start CPU profile: %v", err)
				}
				defer pprof.StopCPUProfile()
				return next(i)
			}
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
