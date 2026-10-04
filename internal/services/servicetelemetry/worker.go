package servicetelemetry

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
)

const (
	// DefaultReportURL is the endpoint that receives telemetry reports.
	DefaultReportURL = "https://telemetry.chronicleclassic.com/api/v1/telemetry/report"

	// DefaultCheckNoticesURL is the endpoint that returns deployment notices.
	DefaultCheckNoticesURL = "https://telemetry.chronicleclassic.com/api/v1/telemetry/check-notices"

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

// Notice is a telemetry notice returned for this deployment.
type Notice struct {
	ID          string    `json:"id"`
	Audience    string    `json:"audience"`
	Category    string    `json:"category"`
	Severity    string    `json:"severity"`
	Title       string    `json:"title"`
	Message     string    `json:"message"`
	ActionLabel *string   `json:"action_label,omitempty"`
	ActionURL   *string   `json:"action_url,omitempty"`
	StartsAt    time.Time `json:"starts_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type checkNoticesRequest struct {
	DeploymentID string `json:"deployment_id"`
}

type checkNoticesResponse struct {
	Notices *[]Notice `json:"notices"`
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

	Store           database.Store
	Logger          *slog.Logger
	AccessURL       string
	ReportURL       string
	CheckNoticesURL string

	startedAt  time.Time
	httpClient *http.Client
}

func (w *Worker) Work(ctx context.Context, _ *river.Job[ArgsTelemetryReport]) error {
	w.setDefaults()

	deploymentInfo, err := w.Store.GetDeploymentInfo(ctx)
	if err != nil {
		return fmt.Errorf("get deployment info: %w", err)
	}

	token, err := w.ensureDeploymentToken(ctx, deploymentInfo)
	if err != nil {
		return fmt.Errorf("ensure deployment token: %w", err)
	}

	if err := w.checkNotices(ctx, deploymentInfo.ID.String(), token); err != nil {
		w.Logger.WarnContext(ctx, "telemetry notice check failed", slog.String("error", err.Error()))
	}

	// Reports retain their four-hour debounce even though notice checks run hourly.
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
	// also debounce. This prevents retries from hammering the receiver.
	if err := w.Store.UpdateTelemetryHeartbeat(ctx); err != nil {
		w.Logger.WarnContext(ctx, "failed to update telemetry heartbeat", slog.String("error", err.Error()))
	}

	err = w.sendReport(ctx, report, token)
	if err != nil {
		w.Logger.WarnContext(ctx, "telemetry report failed", slog.String("error", err.Error()))
		return nil
	}

	w.Logger.InfoContext(ctx, "telemetry report sent",
		slog.String("deployment_id", report.DeploymentID),
		slog.String("version", report.Version),
		slog.Int64("total_users", report.TotalUsers),
		slog.Int64("total_logs", report.TotalLogFiles),
	)
	return nil
}

func (w *Worker) setDefaults() {
	if w.httpClient == nil {
		w.httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	if w.startedAt.IsZero() {
		w.startedAt = time.Now()
	}
	if w.ReportURL == "" {
		w.ReportURL = DefaultReportURL
	}
	if w.CheckNoticesURL == "" {
		w.CheckNoticesURL = DefaultCheckNoticesURL
	}
}

func (w *Worker) ensureDeploymentToken(ctx context.Context, deploymentInfo database.DeploymentInfo) (string, error) {
	if deploymentInfo.DeploymentToken.Valid && deploymentInfo.DeploymentToken.String != "" {
		return deploymentInfo.DeploymentToken.String, nil
	}

	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}
	candidate := base64.RawURLEncoding.EncodeToString(randomBytes)

	stored, err := w.Store.EnsureDeploymentToken(ctx, pgtype.Text{String: candidate, Valid: true})
	if err != nil {
		return "", fmt.Errorf("persist token: %w", err)
	}
	if !stored.Valid || stored.String == "" {
		return "", fmt.Errorf("persist token: database returned an empty token")
	}
	return stored.String, nil
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

func (w *Worker) sendReport(ctx context.Context, report TelemetryReport, token string) error {
	body, err := json.Marshal(report)
	if err != nil {
		return fmt.Errorf("marshal report: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.ReportURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	setTelemetryHeaders(req, token)

	resp, err := w.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("telemetry receiver returned status %d", resp.StatusCode)
	}
	return nil
}

func (w *Worker) checkNotices(ctx context.Context, deploymentID, token string) error {
	body, err := json.Marshal(checkNoticesRequest{DeploymentID: deploymentID})
	if err != nil {
		return fmt.Errorf("marshal notice request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.CheckNoticesURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create notice request: %w", err)
	}
	setTelemetryHeaders(req, token)

	resp, err := w.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("notice receiver returned status %d", resp.StatusCode)
	}

	var response checkNoticesResponse
	decoder := json.NewDecoder(io.LimitReader(resp.Body, 1<<20))
	if err := decoder.Decode(&response); err != nil {
		return fmt.Errorf("decode notice response: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return fmt.Errorf("decode notice response: %w", err)
	}
	if response.Notices == nil {
		return fmt.Errorf("decode notice response: notices must be an array")
	}
	for i, notice := range *response.Notices {
		if err := validateNotice(notice); err != nil {
			return fmt.Errorf("validate notice %d: %w", i, err)
		}
	}

	if err := w.replaceNotices(ctx, *response.Notices); err != nil {
		return fmt.Errorf("replace notice snapshot: %w", err)
	}
	return nil
}

func (w *Worker) replaceNotices(ctx context.Context, notices []Notice) error {
	return w.Store.InTx(ctx, func(tx database.Store) error {
		if err := tx.DeleteAllTelemetryNotices(ctx); err != nil {
			return fmt.Errorf("delete existing notices: %w", err)
		}
		for _, notice := range notices {
			if err := tx.InsertTelemetryNotice(ctx, database.InsertTelemetryNoticeParams{
				ID:          notice.ID,
				Audience:    notice.Audience,
				Category:    notice.Category,
				Severity:    notice.Severity,
				Title:       notice.Title,
				Message:     notice.Message,
				ActionLabel: optionalText(notice.ActionLabel),
				ActionUrl:   optionalText(notice.ActionURL),
				StartsAt:    pgtype.Timestamptz{Time: notice.StartsAt, Valid: true},
				ExpiresAt:   pgtype.Timestamptz{Time: notice.ExpiresAt, Valid: true},
				UpdatedAt:   pgtype.Timestamptz{Time: notice.UpdatedAt, Valid: true},
			}); err != nil {
				return fmt.Errorf("insert notice %q: %w", notice.ID, err)
			}
		}
		return nil
	}, nil)
}

func optionalText(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func setTelemetryHeaders(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Chronicle/"+version.GitTag)
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra json.RawMessage
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("unexpected trailing JSON")
		}
		return err
	}
	return nil
}

func validateNotice(notice Notice) error {
	if strings.TrimSpace(notice.ID) == "" {
		return fmt.Errorf("id is required")
	}
	if strings.TrimSpace(notice.Title) == "" {
		return fmt.Errorf("title is required")
	}
	if strings.TrimSpace(notice.Message) == "" {
		return fmt.Errorf("message is required")
	}
	if !oneOf(notice.Audience, "public", "admin") {
		return fmt.Errorf("invalid audience %q", notice.Audience)
	}
	if !oneOf(notice.Category, "compliance", "release", "maintenance", "announcement") {
		return fmt.Errorf("invalid category %q", notice.Category)
	}
	if !oneOf(notice.Severity, "info", "warning", "critical") {
		return fmt.Errorf("invalid severity %q", notice.Severity)
	}
	if notice.StartsAt.IsZero() {
		return fmt.Errorf("starts_at is required")
	}
	if notice.ExpiresAt.IsZero() {
		return fmt.Errorf("expires_at is required")
	}
	if notice.UpdatedAt.IsZero() {
		return fmt.Errorf("updated_at is required")
	}
	return nil
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
