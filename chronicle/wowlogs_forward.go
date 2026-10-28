package chronicle

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/secrets"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindForwardWoWLogs          = "forward-wow-logs"
	defaultWoWLogsBaseURL       = "https://wow-logs.co.in"
	wowLogsNativeUploaderHeader = "X-Wow-Logs-Native-Uploader"
)

type ArgsForwardWoWLogs struct {
	LogID    uuid.UUID `json:"log_group_id"`
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsForwardWoWLogs) Kind() string { return KindForwardWoWLogs }

func (ArgsForwardWoWLogs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverqueue.QueueExternalUploads,
		Priority:    riverqueue.PriorityLow,
		MaxAttempts: 1,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
			},
		},
	}
}

type wowLogsInstance struct {
	Name               string                  `json:"name"`
	EncounterStartTime string                  `json:"encounterStartTime"`
	StartMS            int64                   `json:"startMs"`
	EndMS              int64                   `json:"endMs"`
	LineStart          int                     `json:"lineStart"`
	LineEnd            int                     `json:"lineEnd"`
	ServerName         string                  `json:"serverName,omitempty"`
	ServerVerified     bool                    `json:"serverVerified,omitempty"`
	Unlisted           bool                    `json:"unlisted,omitempty"`
	Preview            *wowLogsInstancePreview `json:"preview"`
}

type wowLogsInstancePreview struct {
	LoggedBy           string   `json:"loggedBy"`
	Bosses             []string `json:"bosses"`
	FormattedStartTime string   `json:"formattedStartTime"`
	FormattedEndTime   string   `json:"formattedEndTime"`
	DetectedServerName string   `json:"detectedServerName,omitempty"`
	DetectedGUIDPrefix string   `json:"detectedGuidPrefix,omitempty"`
}

type wowLogsPreprocessResponse struct {
	Message      string            `json:"message"`
	PreprocessID int               `json:"preprocessId"`
	Instances    []wowLogsInstance `json:"instances"`
	AutoQueued   bool              `json:"autoQueued"`
}

type wowLogsClient struct {
	baseURL    string
	httpClient *http.Client
}

func (c wowLogsClient) preprocess(ctx context.Context, apiToken string, logData []byte, serverName string, unlisted bool) (wowLogsPreprocessResponse, error) {
	zipBuffer := new(bytes.Buffer)
	zipWriter := zip.NewWriter(zipBuffer)
	entry, err := zipWriter.Create("WoWCombatLog.txt")
	if err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("create zip entry: %w", err)
	}
	if _, err := entry.Write(logData); err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("write zip entry: %w", err)
	}
	if err := zipWriter.Close(); err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("close zip: %w", err)
	}

	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("logFile", "WoWCombatLog.zip")
	if err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("create log form field: %w", err)
	}
	if _, err := io.Copy(part, zipBuffer); err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("write log form field: %w", err)
	}
	if err := writer.WriteField("serverName", serverName); err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("write server name: %w", err)
	}
	if unlisted {
		if err := writer.WriteField("unlisted", "true"); err != nil {
			return wowLogsPreprocessResponse{}, fmt.Errorf("write unlisted flag: %w", err)
		}
	}
	if err := writer.Close(); err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("close multipart body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.baseURL, "/")+"/api/v5/uploader/preprocess", body)
	if err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("create preprocess request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("X-Socket-ID", "chronicle-server")
	setWoWLogsHeaders(req, apiToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("send preprocess request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		return wowLogsPreprocessResponse{}, wowLogsResponseError(resp)
	}

	var result wowLogsPreprocessResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return wowLogsPreprocessResponse{}, fmt.Errorf("decode preprocess response: %w", err)
	}
	if result.PreprocessID == 0 {
		return wowLogsPreprocessResponse{}, fmt.Errorf("preprocess response omitted preprocessId")
	}
	return result, nil
}

func (c wowLogsClient) enqueue(ctx context.Context, apiToken string, preprocess wowLogsPreprocessResponse, unlisted bool) error {
	for i := range preprocess.Instances {
		preprocess.Instances[i].Unlisted = unlisted
	}
	requestBody, err := json.Marshal(struct {
		PreprocessID      int               `json:"preprocessId"`
		SelectedInstances []wowLogsInstance `json:"selectedInstances"`
		SocketID          string            `json:"socketId"`
		Unlisted          bool              `json:"unlisted"`
	}{
		PreprocessID:      preprocess.PreprocessID,
		SelectedInstances: preprocess.Instances,
		SocketID:          "chronicle-server",
		Unlisted:          unlisted,
	})
	if err != nil {
		return fmt.Errorf("encode enqueue request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.baseURL, "/")+"/api/v5/uploader/enqueue-jobs", bytes.NewReader(requestBody))
	if err != nil {
		return fmt.Errorf("create enqueue request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	setWoWLogsHeaders(req, apiToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send enqueue request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusAccepted {
		return wowLogsResponseError(resp)
	}
	return nil
}

func setWoWLogsHeaders(req *http.Request, apiToken string) {
	req.Header.Set(wowLogsNativeUploaderHeader, "1")
	req.Header.Set("X-API-Token", apiToken)
}

func wowLogsResponseError(resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	var payload struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &payload) == nil && strings.TrimSpace(payload.Message) != "" {
		return fmt.Errorf("wow-logs returned %s: %s", resp.Status, strings.TrimSpace(payload.Message))
	}
	return fmt.Errorf("wow-logs returned %s: %s", resp.Status, strings.TrimSpace(string(body)))
}

// ErrCredentialsDisabled is returned when no credential encryption key is
// configured, so user tokens cannot be stored.
var ErrCredentialsDisabled = errors.New("credential storage is not configured")

const wowLogsTokenPurpose = "wow-logs-token"

// CredentialsAvailable reports whether user tokens can be stored.
func (c *Chronicle) CredentialsAvailable() bool { return c.credentialCipher != nil }

// SetUserWoWLogsToken encrypts and stores the user's own wow-logs API token.
// Only that user's uploads are forwarded with it.
func (c *Chronicle) SetUserWoWLogsToken(ctx context.Context, userID uuid.UUID, token string) error {
	if c.credentialCipher == nil {
		return ErrCredentialsDisabled
	}
	encrypted, err := c.credentialCipher.Encrypt([]byte(token), secrets.UserCredentialAAD(userID.String(), wowLogsTokenPurpose))
	if err != nil {
		return fmt.Errorf("encrypt wow-logs token: %w", err)
	}
	_, err = c.Zed.UpsertUserWoWLogsCredential(ctx, database.UpsertUserWoWLogsCredentialParams{
		UserID:               userID,
		EncryptedToken:       encrypted,
		CredentialKeyVersion: c.credentialCipher.KeyID(),
	})
	return err
}

// DeleteUserWoWLogsToken removes the user's token, opting them out of forwarding.
func (c *Chronicle) DeleteUserWoWLogsToken(ctx context.Context, userID uuid.UUID) error {
	return c.Zed.DeleteUserWoWLogsCredential(ctx, userID)
}

// UserWoWLogsTokenUpdatedAt reports when the user last saved a token, or
// nil when they have none. The token itself is never returned.
func (c *Chronicle) UserWoWLogsTokenUpdatedAt(ctx context.Context, userID uuid.UUID) (*time.Time, error) {
	row, err := c.Zed.GetUserWoWLogsCredential(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row.UpdatedAt.Time, nil
}

// userWoWLogsToken returns the decrypted token, or "" when the user has not
// opted in.
func (c *Chronicle) userWoWLogsToken(ctx context.Context, userID uuid.UUID) (string, error) {
	if c.credentialCipher == nil {
		return "", nil
	}
	row, err := c.Zed.GetUserWoWLogsCredential(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("fetch wow-logs token: %w", err)
	}
	token, err := c.credentialCipher.Decrypt(row.EncryptedToken, secrets.UserCredentialAAD(userID.String(), wowLogsTokenPurpose))
	if err != nil {
		return "", fmt.Errorf("decrypt wow-logs token: %w", err)
	}
	return string(token), nil
}

func (c *Chronicle) enqueueWoWLogsForward(ctx context.Context, logID, tenantID, ownerID uuid.UUID) error {
	if c.queue == nil || tenantID == uuid.Nil || c.credentialCipher == nil {
		return nil
	}
	tenant, err := c.Zed.GetTenantByID(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("fetch tenant forwarding config: %w", err)
	}
	if !tenant.WowLogsForwardingEnabled {
		return nil
	}
	updatedAt, err := c.UserWoWLogsTokenUpdatedAt(ctx, ownerID)
	if err != nil {
		return fmt.Errorf("fetch uploader wow-logs token: %w", err)
	}
	if updatedAt == nil {
		return nil
	}
	_, err = c.queue.Insert(ctx, ArgsForwardWoWLogs{LogID: logID, TenantID: tenantID}, nil)
	return err
}

type WorkerForwardWoWLogs struct {
	parent *Chronicle
	river.WorkerDefaults[ArgsForwardWoWLogs]
}

func (c *Chronicle) NewWorkerForwardWoWLogs() river.Worker[ArgsForwardWoWLogs] {
	return &WorkerForwardWoWLogs{parent: c}
}

func (w *WorkerForwardWoWLogs) Work(ctx context.Context, job *river.Job[ArgsForwardWoWLogs]) error {
	ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)

	tenant, err := w.parent.Zed.GetTenantByID(ctx, job.Args.TenantID)
	if err != nil {
		return fmt.Errorf("fetch tenant: %w", err)
	}
	if !tenant.WowLogsForwardingEnabled {
		return nil
	}

	groupRow, err := w.parent.Zed.GetWoWLogGroupByID(ctx, job.Args.LogID)
	if err != nil {
		return fmt.Errorf("fetch log group: %w", err)
	}
	files, err := w.parent.Zed.GetWoWLogFilesByGroupID(ctx, job.Args.LogID)
	if err != nil {
		return fmt.Errorf("fetch log files: %w", err)
	}
	if len(files) != 1 {
		return river.JobCancel(fmt.Errorf("wow-logs forwarding requires exactly one log file, found %d", len(files)))
	}
	instances, err := w.parent.Zed.GetInstancesByLogGroupID(ctx, job.Args.LogID)
	if err != nil {
		return fmt.Errorf("fetch parsed instances: %w", err)
	}
	if len(instances) == 0 {
		return river.JobCancel(fmt.Errorf("wow-logs forwarding requires a parsed instance"))
	}
	realm, err := w.parent.Zed.GetWoWServerRealm(ctx, instances[0].RealmID)
	if err != nil {
		return fmt.Errorf("fetch realm: %w", err)
	}
	serverName, err := wowLogsServerName(tenant, realm)
	if err != nil {
		return river.JobCancel(err)
	}
	// Forward with the uploader's own token; if they removed it since the job
	// was queued, they have opted out.
	apiToken, err := w.parent.userWoWLogsToken(ctx, groupRow.WoWLogGroup.Owner)
	if err != nil {
		return err
	}
	if apiToken == "" {
		return nil
	}

	logData, err := w.parent.loadFileBytes(ctx, files[0])
	if err != nil {
		return fmt.Errorf("load raw log: %w", err)
	}
	preprocess, err := w.parent.wowLogsClient.preprocess(ctx, apiToken, logData, serverName, groupRow.WoWLogGroup.Unlisted)
	if err != nil {
		return err
	}
	if !preprocess.AutoQueued {
		if len(preprocess.Instances) == 0 {
			return river.JobCancel(fmt.Errorf("wow-logs preprocess found no instances"))
		}
		if err := w.parent.wowLogsClient.enqueue(ctx, apiToken, preprocess, groupRow.WoWLogGroup.Unlisted); err != nil {
			return err
		}
	}

	_ = river.RecordOutput(ctx, map[string]any{
		"preprocess_id": preprocess.PreprocessID,
		"instances":     len(preprocess.Instances),
		"auto_queued":   preprocess.AutoQueued,
		"server_name":   serverName,
	})
	return nil
}

func wowLogsServerName(tenant database.Tenant, realm database.WowServerRealm) (string, error) {
	tenantName := strings.ToLower(tenant.Name)
	if tenant.Slug.Valid {
		tenantName += " " + strings.ToLower(tenant.Slug.String)
	}
	realmName := strings.ToLower(realm.Name)

	switch {
	case strings.Contains(tenantName, "chromie"):
		return "Chromiecraft", nil
	case strings.Contains(tenantName, "warmane"):
		switch {
		case strings.Contains(realmName, "icecrown"):
			return "Warmane_Icecrown", nil
		case strings.Contains(realmName, "lordaeron"):
			return "Warmane_Lordaeron", nil
		case strings.Contains(realmName, "onyxia"):
			return "Warmane_Onyxia", nil
		default:
			return "", fmt.Errorf("unsupported Warmane realm %q for wow-logs forwarding", realm.Name)
		}
	default:
		return "", fmt.Errorf("tenant %q is not supported by wow-logs forwarding", tenant.Name)
	}
}

func defaultWoWLogsHTTPClient() *http.Client {
	return &http.Client{Timeout: 3 * time.Minute}
}
