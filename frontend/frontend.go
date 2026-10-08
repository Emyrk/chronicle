package frontend

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"io/fs"
	"net/http"
	"path"
	"path/filepath"
	"strings"
	"text/template" // html/template escapes some nonces
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/internal/version"
	"golang.org/x/xerrors"
)

// OGData holds Open Graph metadata for dynamic page previews (e.g. Discord embeds).
type OGData struct {
	Title       string
	Description string
	URL         string
}

// OGRoute registers a chi route pattern that resolves Open Graph metadata.
// The handler receives the matched chi context and returns OGData or nil.
type OGRoute struct {
	Pattern string
	Resolve func(r *http.Request) *OGData
}

type ogResult struct {
	data *OGData
}

// HTMLBranding carries per-request branding overrides for the HTML template.
type HTMLBranding struct {
	Title           string // Page title. Empty = default "Chronicle".
	SiteName        string // Tenant/site display name used to suffix route-specific titles.
	Description     string // Tenant/site description. Empty = default Chronicle description.
	CanonicalURL    string // Absolute canonical URL for this request.
	ImageURL        string // Absolute social preview image URL.
	Robots          string // Page-level robots directive. Empty = indexable default.
	JSONLD          string // JSON-LD generated from trusted, JSON-marshaled values.
	Favicon         string // Favicon URL. Empty = default /c/chronicle/favicon.ico.
	ThemeCSS        string // Pre-built CSS variable overrides for tenant theming.
	AdSenseClientID string // Public publisher ID for verification metadata; empty disables it.
	GA4ID           string // GA4 measurement ID; empty disables analytics.
}

// BrandingResolver is an optional callback that returns per-request branding
// from the request context (e.g. tenant branding for title/favicon).
type BrandingResolver func(r *http.Request) *HTMLBranding

// BlogFlavorResolver returns the flavor tags available to the current request.
// The blog uses them both to hydrate the client and to reject flavor-bound posts.
type BlogFlavorResolver func(r *http.Request) []string

type blogManifest struct {
	Posts []blogManifestPost `json:"posts"`
}

type blogManifestPost struct {
	Path       string     `json:"path"`
	FlavorSets [][]string `json:"flavor_sets"`
}

type handler struct {
	fs                 fs.FS
	mux                *http.ServeMux
	htmlTemplates      *template.Template
	ogRouter           chi.Router
	brandingResolver   BrandingResolver
	blogFlavorResolver BlogFlavorResolver
	blogPosts          map[string]blogManifestPost
}

func Handler(siteFS fs.FS, ogRoutes []OGRoute, brandingResolver BrandingResolver, blogFlavorResolver BlogFlavorResolver) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", etagMiddleware(http.FileServer(http.FS(siteFS))))

	tmpls, err := findAndParseHTMLFiles(siteFS)
	if err != nil {
		panic(fmt.Sprintf("Failed to parse html files: %v", err))
	}

	// Build a chi router used solely for OG metadata resolution.
	// Each route's Resolve function is called when the path matches,
	// with chi URL params available via chi.URLParam(r, ...).
	ogRouter := chi.NewRouter()
	for _, route := range ogRoutes {
		resolve := route.Resolve
		ogRouter.Get(route.Pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			result := r.Context().Value(ogResultKey{}).(*ogResult)
			result.data = resolve(r)
		}))
	}

	blogPosts, err := loadBlogManifest(siteFS)
	if err != nil {
		panic(fmt.Sprintf("Failed to parse blog manifest: %v", err))
	}

	return &handler{
		fs:                 siteFS,
		mux:                mux,
		htmlTemplates:      tmpls,
		ogRouter:           ogRouter,
		brandingResolver:   brandingResolver,
		blogFlavorResolver: blogFlavorResolver,
		blogPosts:          blogPosts,
	}
}

func loadBlogManifest(siteFS fs.FS) (map[string]blogManifestPost, error) {
	data, err := fs.ReadFile(siteFS, "blog-manifest.json")
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}

	var manifest blogManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}

	posts := make(map[string]blogManifestPost, len(manifest.Posts))
	for _, post := range manifest.Posts {
		posts[path.Clean(post.Path)] = post
	}
	return posts, nil
}

type ogResultKey struct{}

// discardResponseWriter is an http.ResponseWriter that discards all output.
type discardResponseWriter struct{}

func (discardResponseWriter) Header() http.Header         { return http.Header{} }
func (discardResponseWriter) Write(b []byte) (int, error) { return len(b), nil }
func (discardResponseWriter) WriteHeader(int)             {}

// resolveOG uses the chi OG router to match the request path and resolve
// Open Graph metadata. Returns nil if no route matches or the resolver
// returns nil.
func (h *handler) resolveOG(req *http.Request) *OGData {
	result := &ogResult{}
	ctx := context.WithValue(req.Context(), ogResultKey{}, result)
	// Create a throwaway request for the OG router so it doesn't
	// interfere with the real request's chi context.
	ogReq := req.Clone(ctx)
	h.ogRouter.ServeHTTP(discardResponseWriter{}, ogReq)
	return result.data
}

func (h *handler) ServeHTTP(resp http.ResponseWriter, req *http.Request) {
	flavor := []string(nil)
	if h.blogFlavorResolver != nil {
		flavor = h.blogFlavorResolver(req)
	}
	if !h.blogPathAllowed(req.URL.Path, flavor) {
		http.NotFound(resp, req)
		return
	}

	flavorJSON, _ := json.Marshal(flavor)

	// reqFile is the static file requested.
	reqFile := filePath(req.URL.Path)
	if path.Clean(req.URL.Path) == "/blog" {
		reqFile = "blog/index.html"
	}

	state := htmlState{
		GitCommit:      version.GitCommit,
		GitTag:         version.GitTag,
		BuildTime:      version.BuildTime,
		BlogFlavorJSON: string(flavorJSON),
	}

	// Enrich from request context (e.g. tenant branding and indexing policy).
	if h.brandingResolver != nil {
		if b := h.brandingResolver(req); b != nil {
			state.Title = b.Title
			state.SiteName = b.SiteName
			state.Description = b.Description
			state.CanonicalURL = b.CanonicalURL
			state.ImageURL = b.ImageURL
			state.Robots = b.Robots
			state.JSONLD = b.JSONLD
			state.Favicon = b.Favicon
			state.ThemeCSS = b.ThemeCSS
			state.AdSenseClientID = b.AdSenseClientID
			state.GA4ID = b.GA4ID
		}
	}

	// Route metadata overrides tenant defaults while retaining tenant identity.
	if og := h.resolveOG(req); og != nil {
		state.OGTitle = og.Title
		state.OGDescription = og.Description
		state.OGURL = og.URL
		if og.URL != "" {
			state.CanonicalURL = og.URL
		}
		if og.Title != "" {
			state.Title = og.Title
			if state.SiteName != "" {
				state.Title += " | " + state.SiteName
			}
		}
	}

	state.escapeHTMLAttributes()

	if h.serveHTML(resp, req, reqFile, state) {
		return
	}

	// If the original file exists, serve it
	if h.exists(reqFile) {
		h.mux.ServeHTTP(resp, req)
		return
	}

	// Serve the file assuming it's an html file
	// This matches paths like `/app/terminal.html`
	req.URL.Path = strings.TrimSuffix(req.URL.Path, "/")
	req.URL.Path += ".html"
	reqFile = filePath(req.URL.Path)
	if h.serveHTML(resp, req, reqFile, state) {
		return
	}

	if h.exists(reqFile) {
		h.mux.ServeHTTP(resp, req)
		return
	}

	req.URL.Path = "/"
	if h.serveHTML(resp, req, "", state) {
		return
	}

	// This will send a correct 404
	h.mux.ServeHTTP(resp, req)
}

func (h *handler) blogPathAllowed(requestPath string, flavor []string) bool {
	cleanPath := path.Clean(requestPath)
	if cleanPath == "/blog" || !strings.HasPrefix(cleanPath, "/blog/") {
		return true
	}

	post, ok := h.blogPosts[cleanPath]
	if !ok {
		return false
	}
	if len(post.FlavorSets) == 0 {
		return true
	}

	available := make(map[string]struct{}, len(flavor))
	for _, tag := range flavor {
		available[strings.ToLower(tag)] = struct{}{}
	}

	for _, required := range post.FlavorSets {
		matches := true
		for _, tag := range required {
			if _, ok := available[strings.ToLower(tag)]; !ok {
				matches = false
				break
			}
		}
		if matches {
			return true
		}
	}
	return false
}

func (h *handler) exists(filePath string) bool {
	f, err := h.fs.Open(filePath)
	if err == nil {
		_ = f.Close()
	}
	return err == nil
}

type htmlState struct {
	GitCommit string
	GitTag    string
	BuildTime string

	// BlogFlavorJSON is injected into pre-rendered blog pages for tenant-aware hydration.
	BlogFlavorJSON string

	// OG meta tags (empty = use defaults from index.html).
	OGTitle       string
	OGDescription string
	OGURL         string

	// Branding and SEO overrides populated from tenant context.
	Title           string
	SiteName        string
	Description     string
	CanonicalURL    string
	ImageURL        string
	Robots          string
	JSONLD          string
	Favicon         string
	ThemeCSS        string
	AdSenseClientID string
	GA4ID           string
}

func (s *htmlState) escapeHTMLAttributes() {
	s.Title = html.EscapeString(s.Title)
	s.SiteName = html.EscapeString(s.SiteName)
	s.Description = html.EscapeString(s.Description)
	s.CanonicalURL = html.EscapeString(s.CanonicalURL)
	s.ImageURL = html.EscapeString(s.ImageURL)
	s.Robots = html.EscapeString(s.Robots)
	s.Favicon = html.EscapeString(s.Favicon)
	s.OGTitle = html.EscapeString(s.OGTitle)
	s.OGDescription = html.EscapeString(s.OGDescription)
	s.OGURL = html.EscapeString(s.OGURL)
}

func (h *handler) serveHTML(resp http.ResponseWriter, request *http.Request, reqPath string, state htmlState) bool {
	if data, err := h.renderHTMLWithState(reqPath, state); err == nil {
		if state.Robots != "" {
			resp.Header().Set("X-Robots-Tag", state.Robots)
		}
		if reqPath == "" {
			// Pass "index.html" to the ServeContent so the ServeContent sets the right content headers.
			reqPath = "index.html"
		}
		http.ServeContent(resp, request, reqPath, time.Time{}, bytes.NewReader(data))
		return true
	}
	return false
}

// renderWithState will render the file using the given nonce if the file exists
// as a template. If it does not, it will return an error.
func (h *handler) renderHTMLWithState(filePath string, state htmlState) ([]byte, error) {
	var buf bytes.Buffer
	if filePath == "" {
		filePath = "index.html"
	}
	tmpl := h.htmlTemplates.Lookup(filePath)
	if tmpl == nil {
		return nil, xerrors.Errorf("template %q not found", filePath)
	}

	err := tmpl.Execute(&buf, state)
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// findAndParseHTMLFiles recursively walks the file system passed finding all *.html files.
// The template returned has all html files parsed.
func findAndParseHTMLFiles(files fs.FS) (*template.Template, error) {
	// root is the collection of html templates. All templates are named by their pathing.
	// So './404.html' is named '404.html'. './subdir/index.html' is 'subdir/index.html'
	root := template.New("")

	rootPath := "."
	err := fs.WalkDir(files, rootPath, func(filePath string, directory fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if directory.IsDir() {
			return nil
		}

		if filepath.Ext(directory.Name()) != ".html" {
			return nil
		}

		file, err := files.Open(filePath)
		if err != nil {
			return err
		}

		data, err := io.ReadAll(file)
		if err != nil {
			return err
		}

		tPath := strings.TrimPrefix(filePath, rootPath+string(filepath.Separator))
		_, err = root.New(tPath).Parse(string(data))
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return root, nil
}

// filePath returns the filepath of the requested file.
func filePath(p string) string {
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.TrimPrefix(path.Clean(p), "/")
}
