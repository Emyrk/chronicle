package cli

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
)

// uploader sends produced artifacts to a running Chronicle server using a
// Bearer token for authentication.
type uploader struct {
	baseURL   string
	token     string
	datasetID string
	mode      string // compare | upsert | insert
	client    *http.Client
}

func newUploader(baseURL, token, datasetID, mode string) *uploader {
	return &uploader{
		baseURL:   strings.TrimSuffix(baseURL, "/"),
		token:     token,
		datasetID: datasetID,
		mode:      mode,
		client:    &http.Client{},
	}
}

// Upload sends a single artifact to the appropriate endpoint based on its
// UploadKind.
func (u *uploader) Upload(art Artifact) error {
	switch art.UploadKind {
	case UploadDBC:
		return u.uploadDBC(art)
	case UploadTalentTrees:
		return u.uploadTalentTrees(art)
	default:
		return fmt.Errorf("unknown upload kind %q", art.UploadKind)
	}
}

// uploadDBC POSTs raw DBC bytes as multipart form data to /game-data/dbc/upload.
func (u *uploader) uploadDBC(art Artifact) error {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("dbc_file", art.Filename)
	if err != nil {
		return fmt.Errorf("create form file: %w", err)
	}
	if _, err := fw.Write(art.Data); err != nil {
		return fmt.Errorf("write form file: %w", err)
	}
	if err := mw.Close(); err != nil {
		return fmt.Errorf("close multipart writer: %w", err)
	}

	q := url.Values{}
	q.Set("mode", u.mode)
	q.Set("dbc_type", art.DBCType)
	q.Set("dataset_id", u.datasetID)
	endpoint := u.baseURL + "/api/v1/game-data/dbc/upload?" + q.Encode()

	req, err := http.NewRequest(http.MethodPost, endpoint, &body)
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return u.do(req)
}

// uploadTalentTrees PUTs computed JSON to the dataset talent-trees endpoint.
func (u *uploader) uploadTalentTrees(art Artifact) error {
	endpoint := fmt.Sprintf("%s/api/v1/game-data/datasets/%s/talent-trees", u.baseURL, u.datasetID)
	req, err := http.NewRequest(http.MethodPut, endpoint, bytes.NewReader(art.Data))
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	return u.do(req)
}

// do attaches auth headers, executes the request, and checks the status.
func (u *uploader) do(req *http.Request) error {
	req.Header.Set("Authorization", "Bearer "+u.token)
	resp, err := u.client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("server returned %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}
