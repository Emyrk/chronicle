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
	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
	"github.com/go-chi/chi/v5"
	"golang.org/x/time/rate"
)

const (
	manifestFilename    = "chronicle-panel.json"
	maxResolveBody      = 4 * 1024
	maxManifestSize     = 64 * 1024
	maxEntrySize        = 2 * 1024 * 1024
	maxWorkerSize       = 4 * 1024 * 1024
	maxStylesSize       = 512 * 1024
	maxCommitBody       = 64 * 1024
	maxPanels           = 16
	maxPanelDescription = 300
)

var (
	ownerPattern  = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`)
	repoPattern   = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)
	idPattern     = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	refPattern    = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$`)
	commitPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
	digestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
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
	allowedHosts := map[string]struct{}{apiBase.Host: {}, rawBase.Host: {}}
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
	return &Handler{client: &clone, apiBaseURL: apiBase, rawBaseURL: rawBase, requestTimeout: opts.RequestTimeout, resolveLimiter: newIPLimiter(rate.Every(12*time.Second), 5, 1024)}
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.With(h.resolveLimiter.middleware).Post("/resolve", h.Resolve)
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
	response, err := h.resolveRelease(ctx, repository, owner, repo, commit)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

// ResolveRelease fetches and validates the manifest pinned to an exact commit.
// It never fetches artifact bytes.
func (h *Handler) ResolveRelease(ctx context.Context, repository, commit string) (chroniclesdk.CustomPanelResolveResponse, error) {
	normalized, owner, repo, err := validateRepository(repository)
	if err != nil || normalized != repository {
		return chroniclesdk.CustomPanelResolveResponse{}, invalid("repository must be normalized owner/repo")
	}
	if !commitPattern.MatchString(commit) {
		return chroniclesdk.CustomPanelResolveResponse{}, invalid("commit must be a 40-character lowercase hexadecimal SHA")
	}
	ctx, cancel := context.WithTimeout(ctx, h.requestTimeout)
	defer cancel()
	return h.resolveRelease(ctx, repository, owner, repo, commit)
}

func (h *Handler) resolveRelease(ctx context.Context, repository, owner, repo, commit string) (chroniclesdk.CustomPanelResolveResponse, error) {
	manifest, _, err := h.fetchManifest(ctx, owner, repo, commit)
	if err != nil {
		return chroniclesdk.CustomPanelResolveResponse{}, err
	}
	if err := validateManifest(repository, &manifest); err != nil {
		return chroniclesdk.CustomPanelResolveResponse{}, err
	}
	canonicalManifest, err := CanonicalManifest(manifest)
	if err != nil {
		return chroniclesdk.CustomPanelResolveResponse{}, &apiError{status: http.StatusUnprocessableEntity, message: "Custom panel manifest cannot be canonicalized.", detail: err.Error()}
	}
	manifestHash := sha256.Sum256(canonicalManifest)
	return chroniclesdk.CustomPanelResolveResponse{
		Repository: repository, CommitSHA: commit, Manifest: manifest,
		ManifestSHA256: hex.EncodeToString(manifestHash[:]), Artifacts: ArtifactSet(repository, commit, manifest.Artifacts),
	}, nil
}

// CanonicalJSON returns the RFC 8785/JCS representation used for release
// identity and cross-language SHA-256 verification.
func CanonicalJSON(encoded []byte) ([]byte, error) {
	return jsoncanonicalizer.Transform(encoded)
}

func CanonicalManifest(manifest chroniclesdk.CustomPanelManifest) ([]byte, error) {
	encoded, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	return CanonicalJSON(encoded)
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
	u := *h.rawBaseURL
	u.Path = strings.TrimSuffix(u.Path, "/") + "/" + owner + "/" + repo + "/" + commit + "/" + manifestFilename
	body, err := h.getWithAccept(ctx, u.String(), maxManifestSize, "manifest", "application/vnd.github+json")
	if err != nil {
		return chroniclesdk.CustomPanelManifest{}, nil, err
	}
	var manifest chroniclesdk.CustomPanelManifest
	if err := decodeJSONBytes(body, &manifest); err != nil {
		return chroniclesdk.CustomPanelManifest{}, nil, &apiError{status: http.StatusUnprocessableEntity, message: "Custom panel manifest is invalid.", detail: err.Error()}
	}
	return manifest, body, nil
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
		status, message := http.StatusBadGateway, "GitHub request failed."
		switch resp.StatusCode {
		case http.StatusNotFound:
			status, message = http.StatusNotFound, "GitHub repository, ref, or file was not found."
		case http.StatusForbidden, http.StatusTooManyRequests:
			status, message = http.StatusServiceUnavailable, "GitHub is temporarily unavailable or rate limited."
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

func validateRepository(value string) (normalized, owner, repo string, err error) {
	if len(value) > 141 || strings.Count(value, "/") != 1 {
		return "", "", "", invalid("repository must use the owner/repo form")
	}
	parts := strings.SplitN(value, "/", 2)
	if !ownerPattern.MatchString(parts[0]) || !repoPattern.MatchString(parts[1]) || parts[1] == "." || parts[1] == ".." || strings.HasSuffix(strings.ToLower(parts[1]), ".git") {
		return "", "", "", invalid("repository contains an invalid GitHub owner or repository name")
	}
	owner, repo = strings.ToLower(parts[0]), strings.ToLower(parts[1])
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
	if err := validateArtifact("entry", &manifest.Artifacts.Entry, true, maxEntrySize); err != nil {
		return err
	}
	if err := validateArtifact("worker", manifest.Artifacts.Worker, false, maxWorkerSize); err != nil {
		return err
	}
	if err := validateArtifact("styles", manifest.Artifacts.Styles, false, maxStylesSize); err != nil {
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
		if len(panel.Description) > maxPanelDescription {
			return manifestInvalid(fmt.Sprintf("panels[%d].description exceeds %d bytes", i, maxPanelDescription))
		}
		if panel.Worker && manifest.Artifacts.Worker == nil {
			return manifestInvalid(fmt.Sprintf("panels[%d] requires an undeclared worker artifact", i))
		}
		seen := make(map[chroniclesdk.WoWEventType]struct{}, len(panel.Streams))
		for _, stream := range panel.Streams {
			if !stream.IsValid() || stream != chroniclesdk.WoWEventType(strings.ToLower(string(stream))) {
				return manifestInvalid(fmt.Sprintf("panels[%d] contains unknown stream type %q", i, stream))
			}
			if _, ok := seen[stream]; ok {
				return manifestInvalid(fmt.Sprintf("panels[%d] contains duplicate stream type %q", i, stream))
			}
			seen[stream] = struct{}{}
		}
	}
	return nil
}

func validateArtifact(name string, artifact *chroniclesdk.CustomPanelManifestArtifact, required bool, maxSize int64) error {
	if artifact == nil {
		if required {
			return manifestInvalid("artifacts." + name + " is required")
		}
		return nil
	}
	if err := validateArtifactPath(name, artifact.Path); err != nil {
		return err
	}
	if !digestPattern.MatchString(artifact.SHA256) {
		return manifestInvalid("artifacts." + name + ".sha256 must be 64 lowercase hexadecimal characters")
	}
	if artifact.Size < 0 || artifact.Size > maxSize {
		return manifestInvalid(fmt.Sprintf("artifacts.%s.size must be between 0 and %d bytes", name, maxSize))
	}
	return nil
}

func ArtifactSet(repository, commit string, declared chroniclesdk.CustomPanelManifestArtifacts) chroniclesdk.CustomPanelArtifactSet {
	artifact := func(value chroniclesdk.CustomPanelManifestArtifact) chroniclesdk.CustomPanelArtifact {
		return chroniclesdk.CustomPanelArtifact{URL: "https://raw.githubusercontent.com/" + repository + "/" + commit + "/" + value.Path, SHA256: value.SHA256, Size: value.Size}
	}
	result := chroniclesdk.CustomPanelArtifactSet{Entry: artifact(declared.Entry)}
	if declared.Worker != nil {
		value := artifact(*declared.Worker)
		result.Worker = &value
	}
	if declared.Styles != nil {
		value := artifact(*declared.Styles)
		result.Styles = &value
	}
	return result
}

func ValidateStoredInstallation(installation chroniclesdk.CustomPanelInstallation) error {
	repository, _, _, err := validateRepository(installation.Repository)
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
	if !digestPattern.MatchString(installation.ManifestSHA256) {
		return invalid("installation manifest SHA-256 is invalid")
	}
	expected := ArtifactSet(repository, installation.CommitSHA, installation.Manifest.Artifacts)
	if installation.Artifacts.Entry != expected.Entry || !equalArtifact(installation.Artifacts.Worker, expected.Worker) || !equalArtifact(installation.Artifacts.Styles, expected.Styles) {
		return invalid("installation artifacts do not match the manifest")
	}
	return nil
}

func equalArtifact(left, right *chroniclesdk.CustomPanelArtifact) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func validateArtifactPath(name, value string) error {
	if value == "" || len(value) > 255 || !pathPattern.MatchString(value) || strings.Contains(value, "\\") || strings.ContainsAny(value, "?#") || strings.HasPrefix(value, "/") || path.Clean(value) != value {
		return manifestInvalid("artifacts." + name + ".path must be a clean repository-relative path")
	}
	for _, part := range strings.Split(value, "/") {
		if part == "." || part == ".." {
			return manifestInvalid("artifacts." + name + ".path must not contain path traversal")
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
