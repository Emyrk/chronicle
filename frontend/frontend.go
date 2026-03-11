package frontend

import (
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"text/template" // html/template escapes some nonces
	"time"

	"github.com/Emyrk/chronicle/internal/version"
	"golang.org/x/xerrors"
)

// OGData holds Open Graph metadata for dynamic page previews (e.g. Discord embeds).
type OGData struct {
	Title       string
	Description string
	URL         string
}

// OGResolver resolves Open Graph metadata for a given instance ID or slug.
// Returns nil if the instance is not found or on error.
type OGResolver func(instanceIDOrSlug string) *OGData

type handler struct {
	fs            fs.FS
	mux           *http.ServeMux
	htmlTemplates *template.Template
	ogResolver    OGResolver
}

func Handler(siteFS fs.FS, ogResolver OGResolver) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", etagMiddleware(http.FileServer(http.FS(siteFS))))

	tmpls, err := findAndParseHTMLFiles(siteFS)
	if err != nil {
		panic(fmt.Sprintf("Failed to parse html files: %v", err))
	}

	return &handler{
		fs:            siteFS,
		mux:           mux,
		htmlTemplates: tmpls,
		ogResolver:    ogResolver,
	}
}

// instancePathRe matches /instances/<id-or-slug> with optional trailing slash.
var instancePathRe = regexp.MustCompile(`^/instances/([^/]+)/?$`)

func (h *handler) ServeHTTP(resp http.ResponseWriter, req *http.Request) {
	// reqFile is the static file requested
	reqFile := filePath(req.URL.Path)

	state := htmlState{
		GitCommit: version.GitCommit,
		GitTag:    version.GitTag,
		BuildTime: version.BuildTime,
	}

	// Enrich OG meta tags for instance pages.
	if h.ogResolver != nil {
		if m := instancePathRe.FindStringSubmatch(req.URL.Path); m != nil {
			if og := h.ogResolver(m[1]); og != nil {
				state.OGTitle = og.Title
				state.OGDescription = og.Description
				state.OGURL = og.URL
			}
		}
	}

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

	// OG meta tags (empty = use defaults from index.html).
	OGTitle       string
	OGDescription string
	OGURL         string
}

func (h *handler) serveHTML(resp http.ResponseWriter, request *http.Request, reqPath string, state htmlState) bool {
	if data, err := h.renderHTMLWithState(reqPath, state); err == nil {
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
