package chronicle

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"runtime/pprof"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/riverqueue/river/rivertype"
)

func parseCPUProfilePath(logID uuid.UUID) string {
	return filepath.Join("logs", logID.String(), "cpu.pprof")
}

func (c *Chronicle) DownloadParseCPUProfile(ctx context.Context, logID uuid.UUID) ([]byte, error) {
	profile, err := c.Storage.DownloadFile(ctx, BucketParseProfiles, parseCPUProfilePath(logID))
	if err != nil {
		return nil, fmt.Errorf("download parse CPU profile: %w", err)
	}
	return profile, nil
}

func (c *Chronicle) CurrentParseCPUProfileAvailable(ctx context.Context, logID uuid.UUID) (bool, error) {
	state, err := c.WoWLogGroup(ctx, logID)
	if err != nil {
		return false, err
	}
	if state.Status.Kind != KindLogParse || state.Status.State != rivertype.JobStateCompleted || len(state.Status.Output) == 0 {
		return false, nil
	}

	var output chroniclesdk.WoWParsedLogJobOutput
	if err := json.Unmarshal(state.Status.Output, &output); err != nil {
		return false, fmt.Errorf("decode current parse output: %w", err)
	}
	return output.Report != nil && output.Report.CPUProfileAvailable, nil
}

func (c *Chronicle) RemoveParseCPUProfile(ctx context.Context, logID uuid.UUID) error {
	_, err := c.Storage.RemoveFile(ctx, BucketParseProfiles, []string{parseCPUProfilePath(logID)})
	if err != nil {
		return fmt.Errorf("remove parse CPU profile: %w", err)
	}
	return nil
}

// parseCombatLogWithOptionalCPUProfile serializes profiled parses against all
// other Chronicle parse phases. runtime/pprof CPU profiling is process-global,
// so ordinary parses take a shared lock while a profiled parse takes the
// exclusive lock. Other process goroutines may still appear in the profile.
func (w *WorkerLogParse) parseCombatLogWithOptionalCPUProfile(
	ctx context.Context,
	logID uuid.UUID,
	enabled bool,
	parse func() (*parseResult, error),
) (*parseResult, bool, error) {
	if !enabled {
		w.parent.parseProfileMu.RLock()
		defer w.parent.parseProfileMu.RUnlock()
		result, err := parse()
		return result, false, err
	}

	w.parent.parseProfileMu.Lock()
	locked := true
	defer func() {
		if locked {
			w.parent.parseProfileMu.Unlock()
		}
	}()

	var profile bytes.Buffer
	if err := pprof.StartCPUProfile(&profile); err != nil {
		return nil, false, fmt.Errorf("start parse CPU profile: %w", err)
	}
	var result *parseResult
	var parseErr error
	func() {
		defer pprof.StopCPUProfile()
		result, parseErr = parse()
	}()
	profileBytes := bytes.Clone(profile.Bytes())
	w.parent.parseProfileMu.Unlock()
	locked = false

	contentType := "application/octet-stream"
	if _, err := w.parent.Storage.UploadFile(
		context.WithoutCancel(ctx),
		BucketParseProfiles,
		parseCPUProfilePath(logID),
		bytes.NewReader(profileBytes),
		storage.FileOptions{ContentType: &contentType},
	); err != nil {
		return nil, false, fmt.Errorf("upload parse CPU profile: %w", err)
	}

	return result, true, parseErr
}
