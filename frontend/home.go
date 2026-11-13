package frontend

import (
	"encoding/json"
	"errors"
	"html"
	"io/fs"
	"slices"
	"strings"
)

// HomeConfig contains only public inputs needed before live site configuration loads.
type HomeConfig struct {
	Flavor                []string
	ForeverLandingEnabled bool
	UploadsDisabled       bool
	RootUploadsDisabled   bool
}

type homeBootstrap struct {
	ProductName         string `json:"productName"`
	ForeverLanding      bool   `json:"foreverLanding"`
	UploadsDisabled     bool   `json:"uploadsDisabled"`
	RootUploadsDisabled bool   `json:"rootUploadsDisabled"`
}

type homeManifest struct {
	Products [][2]string       `json:"products"`
	Pages    map[string]string `json:"pages"`
}

func loadHomeManifest(siteFS fs.FS) (*homeManifest, error) {
	data, err := fs.ReadFile(siteFS, "home-manifest.json")
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var manifest homeManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}
	return &manifest, nil
}

func (m *homeManifest) render(config *HomeConfig) (string, string) {
	if m == nil || config == nil {
		return "", ""
	}
	bootstrap := homeBootstrap{
		UploadsDisabled:     config.UploadsDisabled,
		RootUploadsDisabled: config.RootUploadsDisabled,
	}
	for _, product := range m.Products {
		if slices.Contains(config.Flavor, product[0]) {
			bootstrap.ProductName = product[1]
			break
		}
	}
	bootstrap.ForeverLanding = config.ForeverLandingEnabled && slices.Contains(config.Flavor, "wow-forever")
	key := "generic"
	if bootstrap.ProductName != "" {
		key = "named"
	}
	if bootstrap.RootUploadsDisabled {
		key += "-root-closed"
	} else if bootstrap.UploadsDisabled {
		key += "-closed"
	} else {
		key += "-open"
	}
	if bootstrap.ForeverLanding {
		key = "forever"
	}
	markup := m.Pages[key]
	if markup == "" {
		return "", ""
	}
	// The artifact is trusted React output. Only this text token is substituted;
	// request values are never parsed as template syntax or inserted as raw HTML.
	markup = strings.ReplaceAll(markup, "CHRONICLE_HOME_PRODUCT_TOKEN", html.EscapeString(bootstrap.ProductName))
	data, _ := json.Marshal(bootstrap) // encoding/json escapes script-breaking HTML characters.
	return markup, string(data)
}
