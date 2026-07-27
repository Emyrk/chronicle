package servicetelemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/riverqueue/river"
)

const (
	// TelemetryURL is the endpoint that receives telemetry reports.
	TelemetryURL = "https://telemetry.chronicleclassic.com/api/v1/telemetry/report"

	// MinHeartbeatInterval is the minimum time between telemetry reports.
	// Reports are skipped if the last heartbeat was within this window.
	// This prevents tight redeploy loops from flooding the receiver.
	MinHeartbeatInterval = 4 * time.Hour
)

// ArgsTelemetryReport is the River job args for a telemetry report.
type ArgsTelemetryReport struct{}

func (ArgsTelemetryReport) Kind() string { return "telemetry_report" }

func (ArgsTelemetryReport) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		Priority:    riverqueue.PriorityLow,
		MaxAttempts: 3,
	}
}

// TelemetryReport is the JSON payload sent to the telemetry receiver.
type TelemetryReport struct {
	DeploymentID        string           `json:"deployment_id"`
	DeploymentCreatedAt time.Time        `json:"deployment_created_at"`
	Version             string           `json:"version"`
	GitCommit           string           `json:"git_commit"`
	ServerType          string           `json:"server_type"`
	AccessURL           string           `json:"access_url"`
	Hostname            string           `json:"hostname"`
	OS                  string           `json:"os"`
	Arch                string           `json:"arch"`
	UptimeSeconds       int64            `json:"uptime_seconds"`
	StartedAt           time.Time        `json:"started_at"`
	TotalUsers          int64            `json:"total_users"`
	TotalLogFiles       int64            `json:"total_log_files"`
	TotalParsedLogBytes int64            `json:"total_parsed_log_bytes"`
	ActiveFileBytes     int64            `json:"active_file_bytes"`
	DeletedFileBytes    int64            `json:"deleted_file_bytes"`
	InstancesByZone     map[string]int64 `json:"instances_by_zone"`
}

// Worker is the River worker that collects telemetry stats and POSTs them
// to the telemetry receiver.
type Worker struct {
	river.WorkerDefaults[ArgsTelemetryReport]

	Store     database.Store
	Logger    *slog.Logger
	AccessURL string

	startedAt  time.Time
	httpClient *http.Client
}

func (w *Worker) Work(ctx context.Context, _ *river.Job[ArgsTelemetryReport]) error {
	if w.httpClient == nil {
		w.httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	if w.startedAt.IsZero() {
		w.startedAt = time.Now()
	}

	// Check if we sent a report recently (debounce redeploy loops).
	deploymentInfo, err := w.Store.GetDeploymentInfo(ctx)
	if err != nil {
		return fmt.Errorf("get deployment info: %w", err)
	}
	if deploymentInfo.LastTelemetryHeartbeat.Valid {
		since := time.Since(deploymentInfo.LastTelemetryHeartbeat.Time)
		if since < MinHeartbeatInterval {
			w.Logger.InfoContext(ctx, "telemetry report skipped (debounce)",
				slog.Duration("since_last", since),
				slog.Duration("min_interval", MinHeartbeatInterval),
			)
			return nil
		}
	}

	report, err := w.collectReport(ctx, deploymentInfo)
	if err != nil {
		return fmt.Errorf("collect telemetry: %w", err)
	}

	// Record the heartbeat regardless of send outcome so that failures
	// also debounce — we don't want retries hammering the receiver.
	if err := w.Store.UpdateTelemetryHeartbeat(ctx); err != nil {
		w.Logger.WarnContext(ctx, "failed to update telemetry heartbeat", slog.String("error", err.Error()))
	}

	err = w.sendReport(ctx, report)
	if err != nil {
		w.Logger.WarnContext(ctx, "telemetry report failed", slog.String("error", err.Error()))
		return nil // Don't return error — heartbeat already recorded, next interval will retry.
	}

	w.Logger.InfoContext(ctx, "telemetry report sent",
		slog.String("deployment_id", report.DeploymentID),
		slog.String("version", report.Version),
		slog.Int64("total_users", report.TotalUsers),
		slog.Int64("total_logs", report.TotalLogFiles),
	)
	return nil
}

func (w *Worker) collectReport(ctx context.Context, deploymentInfo database.DeploymentInfo) (TelemetryReport, error) {
	userCount, err := w.Store.TelemetryGetUserCount(ctx)
	if err != nil {
		return TelemetryReport{}, fmt.Errorf("get user count: %w", err)
	}

	logCount, err := w.Store.TelemetryGetLogFileCount(ctx)
	if err != nil {
		return TelemetryReport{}, fmt.Errorf("get log count: %w", err)
	}

	totalBytes, err := w.Store.TelemetryGetTotalParsedBytes(ctx)
	if err != nil {
		return TelemetryReport{}, fmt.Errorf("get total log bytes: %w", err)
	}

	activeFileBytes, err := w.Store.TelemetryGetActiveFileBytes(ctx)
	if err != nil {
		return TelemetryReport{}, fmt.Errorf("get active file bytes: %w", err)
	}

	deletedFileBytes, err := w.Store.TelemetryGetDeletedFileBytes(ctx)
	if err != nil {
		return TelemetryReport{}, fmt.Errorf("get deleted file bytes: %w", err)
	}

	zoneRows, err := w.Store.TelemetryGetLogCountByZone(ctx)
	if err != nil {
		return TelemetryReport{}, fmt.Errorf("get log count by zone: %w", err)
	}

	logsByZone := make(map[string]int64, len(zoneRows))
	for _, row := range zoneRows {
		logsByZone[row.ZoneName] = row.LogCount
	}

	// Hostname helps disambiguate deployments that leave access-url at its
	// localhost default. Best-effort: an error just leaves it empty.
	hostname, _ := os.Hostname()

	return TelemetryReport{
		DeploymentID:        deploymentInfo.ID.String(),
		DeploymentCreatedAt: deploymentInfo.CreatedAt.Time,
		Version:             version.GitTag,
		GitCommit:           version.GitCommit,
		ServerType:          services.ServerName,
		AccessURL:           w.AccessURL,
		Hostname:            hostname,
		OS:                  runtime.GOOS,
		Arch:                runtime.GOARCH,
		UptimeSeconds:       int64(time.Since(w.startedAt).Seconds()),
		StartedAt:           w.startedAt,
		TotalUsers:          userCount,
		TotalLogFiles:       logCount,
		TotalParsedLogBytes: totalBytes,
		ActiveFileBytes:     activeFileBytes,
		DeletedFileBytes:    deletedFileBytes,
		InstancesByZone:     logsByZone,
	}, nil
}

func (w *Worker) sendReport(ctx context.Context, report TelemetryReport) error {
	body, err := json.Marshal(report)
	if err != nil {
		return fmt.Errorf("marshal report: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, TelemetryURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Chronicle/"+version.GitTag)

	resp, err := w.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("telemetry receiver returned status %d", resp.StatusCode)
	}

	return nil
}
