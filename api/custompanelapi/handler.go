package custompanelapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/go-chi/chi/v5"
	"golang.org/x/time/rate"
)

const (
	manifestFilename = "chronicle-panel.json"
	maxResolveBody   = 4 * 1024
	maxManifestSize  = 64 * 1024
	maxEntrySize     = 2 * 1024 * 1024
	maxWorkerSize    = 4 * 1024 * 1024
	maxStylesSize    = 512 * 1024
	maxCommitBody    = 64 * 1024
	maxPanels        = 16
)

var (
	ownerPattern  = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`)
	repoPattern   = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)
	idPattern     = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	refPattern    = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$`)
	commitPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
	pathPattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]*$`)
)

type Options struct {
	HTTPClient     *http.Client
	APIBaseURL     string
	RawBaseURL     string
	RequestTimeout time.Duration
}

type Handler struct {
	client         *http.Client
	apiBaseURL     *url.URL
	rawBaseURL     *url.URL
	requestTimeout time.Duration
	resolveLimiter *ipLimiter
}

type apiError struct {
	status  int
	message string
	detail  string
}

func (e *apiError) Error() string { return e.detail }

func New(opts Options) *Handler {
	if opts.APIBaseURL == "" {
		opts.APIBaseURL = "https://api.github.com"
	}
	if opts.RawBaseURL == "" {
		opts.RawBaseURL = "https://raw.githubusercontent.com"
	}
	if opts.RequestTimeout <= 0 {
		opts.RequestTimeout = 10 * time.Second
	}

	apiBase, err := url.Parse(opts.APIBaseURL)
	if err != nil {
		panic(fmt.Sprintf("parse custom panel GitHub API base URL: %v", err))
	}
	rawBase, err := url.Parse(opts.RawBaseURL)
	if err != nil {
		panic(fmt.Sprintf("parse custom panel GitHub raw base URL: %v", err))
	}

	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{}
	}
	clone := *client
	allowedHosts := map[string]struct{}{
		apiBase.Host: {},
		rawBase.Host: {},
	}
	previousRedirect := clone.CheckRedirect
	clone.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if _, ok := allowedHosts[req.URL.Host]; !ok {
			return errors.New("redirect to an unapproved host")
		}
		if previousRedirect != nil {
			return previousRedirect(req, via)
		}
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		return nil
	}
	if clone.Timeout == 0 || clone.Timeout > opts.RequestTimeout {
		clone.Timeout = opts.RequestTimeout
	}

	return &Handler{
		client:         &clone,
		apiBaseURL:     apiBase,
		rawBaseURL:     rawBase,
		requestTimeout: opts.RequestTimeout,
		resolveLimiter: newIPLimiter(rate.Every(12*time.Second), 5, 1024),
	}
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.resolveLimiter.middleware).Post("/resolve", h.Resolve)
	r.Get("/github/{owner}/{repo}/{commit}/{artifact}", h.Artifact)
	return r
}

func (h *Handler) Resolve(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.CustomPanelResolveRequest
	if err := decodeJSONLimit(r.Body, maxResolveBody, &req); err != nil {
		h.writeError(w, r, &apiError{status: http.StatusBadRequest, message: "Invalid custom panel request.", detail: err.Error()})
		return
	}

	repository, owner, repo, err := validateRepository(req.Repository)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	ref := strings.TrimSpace(req.Ref)
	if ref == "" {
		ref = "HEAD"
	}
	if err := validateRef(ref); err != nil {
		h.writeError(w, r, err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()
	commit, err := h.resolveRef(ctx, owner, repo, ref)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	manifest, manifestBytes, err := h.fetchManifest(ctx, owner, repo, commit)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := validateManifest(repository, &manifest); err != nil {
		h.writeError(w, r, err)
		return
	}

	artifacts, err := h.fetchArtifactSet(ctx, owner, repo, commit, manifest.Artifacts)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	manifestHash := sha256.Sum256(manifestBytes)
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.CustomPanelResolveResponse{
		Repository:     repository,
		CommitSHA:      commit,
		Manifest:       manifest,
		ManifestSHA256: hex.EncodeToString(manifestHash[:]),
		Artifacts:      artifacts,
	})
}

func (h *Handler) Artifact(w http.ResponseWriter, r *http.Request) {
	repository, owner, repo, err := validateRepository(chi.URLParam(r, "owner") + "/" + chi.URLParam(r, "repo"))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	commit := chi.URLParam(r, "commit")
	if !commitPattern.MatchString(commit) {
		h.writeError(w, r, &apiError{status: http.StatusBadRequest, message: "Invalid custom panel commit.", detail: "commit must be a 40-character lowercase hexadecimal SHA"})
		return
	}
	artifactName := chi.URLParam(r, "artifact")
	if artifactName != "entry" && artifactName != "worker" && artifactName != "styles" {
		h.writeError(w, r, &apiError{status: http.StatusNotFound, message: "Custom panel artifact not found.", detail: "unsupported artifact name"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()
	manifest, _, err := h.fetchManifest(ctx, owner, repo, commit)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := validateManifest(repository, &manifest); err != nil {
		h.writeError(w, r, err)
		return
	}

	artifactPath, limit, contentType := artifactDetails(manifest.Artifacts, artifactName)
	if artifactPath == "" {
		h.writeError(w, r, &apiError{status: http.StatusNotFound, message: "Custom panel artifact not found.", detail: "artifact is not declared by the manifest"})
		return
	}
	body, err := h.fetchRaw(ctx, owner, repo, commit, artifactPath, limit, "artifact")
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	digest := sha256.Sum256(body)
	etag := `"sha256-` + hex.EncodeToString(digest[:]) + `"`

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", etag)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (h *Handler) resolveRef(ctx context.Context, owner, repo, ref string) (string, error) {
	u := *h.apiBaseURL
	u.Path = strings.TrimSuffix(u.Path, "/") + "/repos/" + owner + "/" + repo + "/commits/" + ref
	body, err := h.getWithAccept(ctx, u.String(), maxCommitBody, "repository ref", "application/vnd.github.sha")
	if err != nil {
		return "", err
	}
	sha := strings.ToLower(strings.TrimSpace(string(body)))
	if !commitPattern.MatchString(sha) {
		return "", &apiError{status: http.StatusBadGateway, message: "GitHub returned an invalid commit response.", detail: "commit SHA was not full-length hexadecimal"}
	}
	return sha, nil
}

func (h *Handler) fetchManifest(ctx context.Context, owner, repo, commit string) (chroniclesdk.CustomPanelManifest, []byte, error) {
	body, err := h.fetchRaw(ctx, owner, repo, commit, manifestFilename, maxManifestSize, "manifest")
	if err != nil {
		return chroniclesdk.CustomPanelManifest{}, nil, err
	}
	var manifest chroniclesdk.CustomPanelManifest
	if err := decodeJSONBytes(body, &manifest); err != nil {
		return chroniclesdk.CustomPanelManifest{}, nil, &apiError{status: http.StatusUnprocessableEntity, message: "Custom panel manifest is invalid.", detail: err.Error()}
	}
	return manifest, body, nil
}

func (h *Handler) fetchArtifactSet(ctx context.Context, owner, repo, commit string, declared chroniclesdk.CustomPanelManifestArtifacts) (chroniclesdk.CustomPanelArtifactSet, error) {
	entry, err := h.fetchArtifactMetadata(ctx, owner, repo, commit, "entry", declared.Entry, maxEntrySize)
	if err != nil {
		return chroniclesdk.CustomPanelArtifactSet{}, err
	}
	result := chroniclesdk.CustomPanelArtifactSet{Entry: entry}
	if declared.Worker != "" {
		worker, err := h.fetchArtifactMetadata(ctx, owner, repo, commit, "worker", declared.Worker, maxWorkerSize)
		if err != nil {
			return chroniclesdk.CustomPanelArtifactSet{}, err
		}
		result.Worker = &worker
	}
	if declared.Styles != "" {
		styles, err := h.fetchArtifactMetadata(ctx, owner, repo, commit, "styles", declared.Styles, maxStylesSize)
		if err != nil {
			return chroniclesdk.CustomPanelArtifactSet{}, err
		}
		result.Styles = &styles
	}
	return result, nil
}

func (h *Handler) fetchArtifactMetadata(ctx context.Context, owner, repo, commit, name, artifactPath string, limit int64) (chroniclesdk.CustomPanelArtifact, error) {
	body, err := h.fetchRaw(ctx, owner, repo, commit, artifactPath, limit, "artifact")
	if err != nil {
		return chroniclesdk.CustomPanelArtifact{}, err
	}
	digest := sha256.Sum256(body)
	return chroniclesdk.CustomPanelArtifact{
		URL:    fmt.Sprintf("/api/v1/custom-panels/github/%s/%s/%s/%s", owner, repo, commit, name),
		SHA256: hex.EncodeToString(digest[:]),
		Size:   int64(len(body)),
	}, nil
}

func (h *Handler) fetchRaw(ctx context.Context, owner, repo, commit, filePath string, limit int64, kind string) ([]byte, error) {
	u := *h.rawBaseURL
	u.Path = strings.TrimSuffix(u.Path, "/") + "/" + owner + "/" + repo + "/" + commit + "/" + filePath
	return h.get(ctx, u.String(), limit, kind)
}

func (h *Handler) get(ctx context.Context, rawURL string, limit int64, kind string) ([]byte, error) {
	return h.getWithAccept(ctx, rawURL, limit, kind, "application/vnd.github+json")
}

func (h *Handler) getWithAccept(ctx context.Context, rawURL string, limit int64, kind, accept string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, &apiError{status: http.StatusInternalServerError, message: "Failed to prepare GitHub request.", detail: err.Error()}
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("User-Agent", "Chronicle-Custom-Panels")
	resp, err := h.client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) || isTimeout(err) {
			return nil, &apiError{status: http.StatusGatewayTimeout, message: "GitHub did not respond in time.", detail: err.Error()}
		}
		return nil, &apiError{status: http.StatusBadGateway, message: "GitHub request failed.", detail: err.Error()}
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		status := http.StatusBadGateway
		message := "GitHub request failed."
		switch resp.StatusCode {
		case http.StatusNotFound:
			status = http.StatusNotFound
			message = "GitHub repository, ref, or file was not found."
		case http.StatusForbidden, http.StatusTooManyRequests:
			status = http.StatusServiceUnavailable
			message = "GitHub is temporarily unavailable or rate limited."
		}
		return nil, &apiError{status: status, message: message, detail: fmt.Sprintf("GitHub returned HTTP %d for %s", resp.StatusCode, kind)}
	}
	if resp.ContentLength > limit {
		return nil, &apiError{status: http.StatusRequestEntityTooLarge, message: "Custom panel content is too large.", detail: fmt.Sprintf("%s exceeds %d bytes", kind, limit)}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, &apiError{status: http.StatusBadGateway, message: "Failed to read GitHub response.", detail: err.Error()}
	}
	if int64(len(body)) > limit {
		return nil, &apiError{status: http.StatusRequestEntityTooLarge, message: "Custom panel content is too large.", detail: fmt.Sprintf("%s exceeds %d bytes", kind, limit)}
	}
	return body, nil
}

func artifactDetails(artifacts chroniclesdk.CustomPanelManifestArtifacts, name string) (string, int64, string) {
	switch name {
	case "entry":
		return artifacts.Entry, maxEntrySize, "text/javascript; charset=utf-8"
	case "worker":
		return artifacts.Worker, maxWorkerSize, "text/javascript; charset=utf-8"
	case "styles":
		return artifacts.Styles, maxStylesSize, "text/css; charset=utf-8"
	default:
		return "", 0, ""
	}
}

func validateRepository(value string) (normalized, owner, repo string, err error) {
	if len(value) > 141 || strings.Count(value, "/") != 1 {
		return "", "", "", invalid("repository must use the owner/repo form")
	}
	parts := strings.SplitN(value, "/", 2)
	if !ownerPattern.MatchString(parts[0]) || !repoPattern.MatchString(parts[1]) || parts[1] == "." || parts[1] == ".." || strings.HasSuffix(strings.ToLower(parts[1]), ".git") {
		return "", "", "", invalid("repository contains an invalid GitHub owner or repository name")
	}
	owner = strings.ToLower(parts[0])
	repo = strings.ToLower(parts[1])
	return owner + "/" + repo, owner, repo, nil
}

func validateRef(value string) error {
	if !refPattern.MatchString(value) || strings.Contains(value, "..") || strings.Contains(value, "//") || strings.Contains(value, "@{") || strings.HasSuffix(value, "/") || strings.HasSuffix(value, ".") {
		return invalid("ref contains unsupported characters or sequences")
	}
	for _, part := range strings.Split(value, "/") {
		if part == "." || part == ".." || strings.HasSuffix(strings.ToLower(part), ".lock") {
			return invalid("ref contains an invalid path component")
		}
	}
	return nil
}

func validateManifest(repository string, manifest *chroniclesdk.CustomPanelManifest) error {
	if manifest.SchemaVersion != 1 {
		return manifestInvalid("schema_version must be 1")
	}
	if manifest.Host.APIVersion != 1 {
		return manifestInvalid("host.api_version must be 1")
	}
	if manifest.Plugin.ID != "github:"+repository {
		return manifestInvalid("plugin.id must match github:" + repository)
	}
	if len(manifest.Plugin.Name) == 0 || len(manifest.Plugin.Name) > 100 {
		return manifestInvalid("plugin.name must be between 1 and 100 bytes")
	}
	if len(manifest.Plugin.Version) == 0 || len(manifest.Plugin.Version) > 64 {
		return manifestInvalid("plugin.version must be between 1 and 64 bytes")
	}
	if len(manifest.Plugin.Description) > 1000 {
		return manifestInvalid("plugin.description exceeds 1000 bytes")
	}
	if manifest.Plugin.Homepage != "" {
		u, err := url.Parse(manifest.Plugin.Homepage)
		if err != nil || u.Scheme != "https" || !strings.EqualFold(u.Host, "github.com") || strings.TrimSuffix(strings.ToLower(u.Path), "/") != "/"+repository || u.RawQuery != "" || u.Fragment != "" {
			return manifestInvalid("plugin.homepage must be the repository's https://github.com URL")
		}
	}
	if err := validateArtifactPath("entry", manifest.Artifacts.Entry, true); err != nil {
		return err
	}
	if err := validateArtifactPath("worker", manifest.Artifacts.Worker, false); err != nil {
		return err
	}
	if err := validateArtifactPath("styles", manifest.Artifacts.Styles, false); err != nil {
		return err
	}
	if len(manifest.Panels) == 0 || len(manifest.Panels) > maxPanels {
		return manifestInvalid(fmt.Sprintf("panels must contain between 1 and %d entries", maxPanels))
	}
	ids := make(map[string]struct{}, len(manifest.Panels))
	for i, panel := range manifest.Panels {
		if len(panel.ID) > 64 || !idPattern.MatchString(panel.ID) {
			return manifestInvalid(fmt.Sprintf("panels[%d].id is invalid", i))
		}
		if _, ok := ids[panel.ID]; ok {
			return manifestInvalid("panel IDs must be unique")
		}
		ids[panel.ID] = struct{}{}
		if len(panel.Name) == 0 || len(panel.Name) > 100 {
			return manifestInvalid(fmt.Sprintf("panels[%d].name must be between 1 and 100 bytes", i))
		}
		if len(panel.Description) > 1000 {
			return manifestInvalid(fmt.Sprintf("panels[%d].description exceeds 1000 bytes", i))
		}
		if panel.Worker && manifest.Artifacts.Worker == "" {
			return manifestInvalid(fmt.Sprintf("panels[%d] requires an undeclared worker artifact", i))
		}
		seenStreams := make(map[chroniclesdk.WoWEventType]struct{}, len(panel.Streams))
		for _, stream := range panel.Streams {
			if !stream.IsValid() || stream != chroniclesdk.WoWEventType(strings.ToLower(string(stream))) {
				return manifestInvalid(fmt.Sprintf("panels[%d] contains unknown stream type %q", i, stream))
			}
			if _, ok := seenStreams[stream]; ok {
				return manifestInvalid(fmt.Sprintf("panels[%d] contains duplicate stream type %q", i, stream))
			}
			seenStreams[stream] = struct{}{}
		}
	}
	return nil
}

func ValidateStoredInstallation(installation chroniclesdk.CustomPanelInstallation) error {
	repository, owner, repo, err := validateRepository(installation.Repository)
	if err != nil || repository != installation.Repository {
		return invalid("installation repository is invalid")
	}
	if !commitPattern.MatchString(installation.CommitSHA) {
		return invalid("installation commit SHA is invalid")
	}
	if installation.InstalledRef != "" {
		if err := validateRef(installation.InstalledRef); err != nil {
			return err
		}
	}
	if err := validateManifest(repository, &installation.Manifest); err != nil {
		return err
	}
	if !isHexDigest(installation.ManifestSHA256) {
		return invalid("installation manifest SHA-256 is invalid")
	}
	if _, err := time.Parse(time.RFC3339, installation.InstalledAt); err != nil {
		return invalid("installation installedAt is invalid")
	}
	if _, err := time.Parse(time.RFC3339, installation.UpdatedAt); err != nil {
		return invalid("installation updatedAt is invalid")
	}

	baseURL := fmt.Sprintf("/api/v1/custom-panels/github/%s/%s/%s/", owner, repo, installation.CommitSHA)
	if err := validateStoredArtifact("entry", installation.Artifacts.Entry, baseURL+"entry", true); err != nil {
		return err
	}
	if (installation.Artifacts.Worker != nil) != (installation.Manifest.Artifacts.Worker != "") {
		return invalid("installation worker artifact does not match the manifest")
	}
	if installation.Artifacts.Worker != nil {
		if err := validateStoredArtifact("worker", *installation.Artifacts.Worker, baseURL+"worker", true); err != nil {
			return err
		}
	}
	if (installation.Artifacts.Styles != nil) != (installation.Manifest.Artifacts.Styles != "") {
		return invalid("installation styles artifact does not match the manifest")
	}
	if installation.Artifacts.Styles != nil {
		if err := validateStoredArtifact("styles", *installation.Artifacts.Styles, baseURL+"styles", true); err != nil {
			return err
		}
	}
	return nil
}

func validateStoredArtifact(name string, artifact chroniclesdk.CustomPanelArtifact, expectedURL string, required bool) error {
	if !required && artifact.URL == "" {
		return nil
	}
	if artifact.URL != expectedURL || !isHexDigest(artifact.SHA256) || artifact.Size < 0 {
		return invalid("installation " + name + " artifact is invalid")
	}
	return nil
}

func isHexDigest(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func validateArtifactPath(name, value string, required bool) error {
	if value == "" && !required {
		return nil
	}
	if value == "" || len(value) > 255 || !pathPattern.MatchString(value) || strings.Contains(value, "\\") || strings.ContainsAny(value, "?#") || strings.HasPrefix(value, "/") || path.Clean(value) != value {
		return manifestInvalid("artifacts." + name + " must be a clean repository-relative path")
	}
	for _, part := range strings.Split(value, "/") {
		if part == "." || part == ".." {
			return manifestInvalid("artifacts." + name + " must not contain path traversal")
		}
	}
	return nil
}

func invalid(detail string) error {
	return &apiError{status: http.StatusBadRequest, message: "Invalid custom panel source.", detail: detail}
}

func manifestInvalid(detail string) error {
	return &apiError{status: http.StatusUnprocessableEntity, message: "Custom panel manifest is invalid.", detail: detail}
}

func decodeJSONLimit(reader io.Reader, limit int64, value any) error {
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return err
	}
	if int64(len(body)) > limit {
		return fmt.Errorf("JSON body exceeds %d bytes", limit)
	}
	return decodeJSONBytes(body, value)
}

func decodeJSONBytes(body []byte, value any) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("JSON body must contain exactly one value")
		}
		return err
	}
	return nil
}

func isTimeout(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *apiError
	if !errors.As(err, &apiErr) {
		apiErr = &apiError{status: http.StatusInternalServerError, message: "An internal server error occurred.", detail: err.Error()}
	}
	httpapi.Write(r.Context(), w, apiErr.status, chroniclesdk.Response{Message: apiErr.message, Detail: apiErr.detail})
}

type ipLimiter struct {
	mu         sync.Mutex
	entries    map[string]*limiterEntry
	rate       rate.Limit
	burst      int
	maxEntries int
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newIPLimiter(r rate.Limit, burst, maxEntries int) *ipLimiter {
	return &ipLimiter{entries: make(map[string]*limiterEntry), rate: r, burst: burst, maxEntries: maxEntries}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	entry, ok := l.entries[ip]
	if !ok {
		if len(l.entries) >= l.maxEntries {
			var oldestIP string
			var oldest time.Time
			for candidate, candidateEntry := range l.entries {
				if oldestIP == "" || candidateEntry.lastSeen.Before(oldest) {
					oldestIP, oldest = candidate, candidateEntry.lastSeen
				}
			}
			delete(l.entries, oldestIP)
		}
		entry = &limiterEntry{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.entries[ip] = entry
	}
	entry.lastSeen = now
	return entry.limiter.Allow()
}

func (l *ipLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(clientIP(r)) {
			w.Header().Set("Retry-After", "12")
			httpapi.Write(r.Context(), w, http.StatusTooManyRequests, chroniclesdk.Response{Message: "Too many custom panel resolve requests. Please try again shortly."})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request) string {
	remote := r.RemoteAddr
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		remote = host
	}

	// Only trust forwarding data from a private or loopback reverse proxy. Read
	// the last valid entry so a client-supplied leading value cannot rotate the
	// public resolver's rate-limit key when the proxy appends the real address.
	remoteIP := net.ParseIP(remote)
	if remoteIP != nil && (remoteIP.IsPrivate() || remoteIP.IsLoopback()) {
		forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		for i := len(forwarded) - 1; i >= 0; i-- {
			candidate := strings.TrimSpace(forwarded[i])
			if net.ParseIP(candidate) != nil {
				return candidate
			}
		}
	}
	return remote
}
