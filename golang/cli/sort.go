package cli

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/sorter"

	"github.com/coder/serpent"
)

func SortCmd() *serpent.Command {
	var (
		outputPath string
	)

	cmd := &serpent.Command{
		Use: "sort <file>",
		Options: serpent.OptionSet{
			{
				Name:          "Output",
				Description:   "Where to write the sorted output. Defaults to overwriting the input file.",
				Flag:          "output",
				FlagShorthand: "o",
				Value:         serpent.StringOf(&outputPath),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			sortMePath := i.Args[0]
			ctx := i.Context()
			logger := getLogger(i)

			files, err := openFileReaders(i.Args[0])
			if err != nil {
				return err
			}
			defer func() { closeFiles(files...) }()

			usingTempFile := outputPath == ""
			var outFile *os.File
			if usingTempFile {
				outputPath = filepath.Join(os.TempDir(), fmt.Sprintf("chronicle_sorted_%d", time.Now().UnixMilli()))
				outFile, err = os.OpenFile(outputPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
				if err != nil {
					return fmt.Errorf("creating temp output file: %w", err)
				}
				defer func() {
					_ = outFile.Close()
					_ = os.Remove(outputPath)
				}()
			} else {
				outFile, err = os.OpenFile(outputPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
				if err != nil {
					return fmt.Errorf("opening output file %s: %w", outputPath, err)
				}
			}

			smry, err := sorter.SortLogs(ctx, logger, files[0], outFile)
			if err != nil {
				return fmt.Errorf("sorting logs: %w", err)
			}

			logger.Info("sorted output file",
				slog.String("output", outputPath),
				slog.Time("earliest", smry.Earliest),
				slog.Time("latest", smry.Latest),
				slog.Int("total_lines", smry.Total),
				slog.String("duration", smry.Latest.Sub(smry.Earliest).String()),
				slog.Bool("used_temp_file", usingTempFile),
			)

			if usingTempFile {
				tmpPath := filepath.Join(os.TempDir(), fmt.Sprintf("chronicle_original_%d", time.Now().UnixMilli()))
				err = os.Rename(sortMePath, tmpPath)
				if err != nil {
					return fmt.Errorf("removing original file %s: %w", sortMePath, err)
				}

				err = os.Rename(outputPath, sortMePath)
				if err != nil {
					_ = os.Rename(tmpPath, sortMePath)
					return fmt.Errorf("renaming temp sorted file to original file %s: %w", sortMePath, err)
				}
				// Remove the original
				_ = os.Remove(tmpPath)
				logger.Info("Sorted file in place")
			}

			return nil
		},
	}

	return cmd
}
