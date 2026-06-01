package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// resolveToken returns a Bearer token. If token is already set it is returned
// as-is. Otherwise, if a session cookie is provided, it calls /whoami/dump to
// exchange the cookie for the raw JWT.
func resolveToken(baseURL, token, cookie string) (string, error) {
	if token != "" {
		return token, nil
	}
	if cookie == "" {
		return "", fmt.Errorf("provide --token (CHRONICLE_TOKEN) or --cookie (CHRONICLE_COOKIE)")
	}

	endpoint := strings.TrimSuffix(baseURL, "/") + "/api/v1/whoami/dump"
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("new request: %w", err)
	}
	// The cookie value may be pasted as either the raw session value or the
	// full "name=value" pair. Detect by the cookie name, NOT by '=' — the
	// gorilla session value is base64 and ends with '=' padding, so an
	// '='-based check misfires and drops the name prefix.
	const cookieName = "chronicle_auth_session"
	if strings.Contains(cookie, cookieName+"=") {
		req.Header.Set("Cookie", cookie)
	} else {
		req.Header.Set("Cookie", cookieName+"="+cookie)
	}
	req.Header.Set("X-Chronicle-Token-Dump", "1")

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", fmt.Errorf("token dump request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("token dump returned %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}

	var out chroniclesdk.TokenDumpResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decode token dump: %w", err)
	}
	if out.Token == "" {
		return "", fmt.Errorf("token dump returned an empty token")
	}
	return out.Token, nil
}

// apiGet performs an authenticated GET and decodes the JSON response into v.
func apiGet(baseURL, token, path string, v any) error {
	endpoint := strings.TrimSuffix(baseURL, "/") + path
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("server returned %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

func fetchDatasets(baseURL, token string) ([]chroniclesdk.Dataset, error) {
	var out []chroniclesdk.Dataset
	if err := apiGet(baseURL, token, "/api/v1/admin/datasets", &out); err != nil {
		return nil, err
	}
	return out, nil
}

func fetchDatasetTenants(baseURL, token, datasetID string) ([]chroniclesdk.DatasetTenantSummary, error) {
	var out []chroniclesdk.DatasetTenantSummary
	if err := apiGet(baseURL, token, "/api/v1/admin/datasets/"+datasetID+"/tenants", &out); err != nil {
		return nil, err
	}
	return out, nil
}

// guardChoice is the result of the confirmation prompt.
type guardChoice int

// Order matches the guard menu items below: All, Some, Cancel.
const (
	guardAll guardChoice = iota
	guardSome
	guardCancel
)

// interactiveResult is the outcome of the interactive import flow.
type interactiveResult struct {
	datasetID string
	importers []Importer
}

// runInteractive walks the user through dataset selection, a confirmation
// guard showing affected tenants, and (optionally) an importer picker.
//
// If presetDatasetID is non-empty, the dataset selector is skipped and that
// dataset is used directly (the guard still runs).
//
// defaultImporters is the set chosen via --import (or all); it seeds the
// "Yes, some" multi-select and is used as-is for "Yes, all".
func runInteractive(baseURL, token, presetDatasetID string, defaultImporters []Importer) (*interactiveResult, error) {
	datasets, err := fetchDatasets(baseURL, token)
	if err != nil {
		return nil, fmt.Errorf("fetch datasets: %w", err)
	}
	if len(datasets) == 0 {
		return nil, fmt.Errorf("no datasets exist on %s", baseURL)
	}

	var chosen chroniclesdk.Dataset
	if presetDatasetID != "" {
		// Skip the selector; locate the preset dataset for display.
		found := false
		for _, d := range datasets {
			if d.ID.String() == presetDatasetID {
				chosen = d
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("dataset %s not found on %s", presetDatasetID, baseURL)
		}
	} else {
		// 1. Dataset selector.
		dsItems := make([]listItem, len(datasets))
		for i, d := range datasets {
			dsItems[i] = listItem{
				label: d.Name,
				desc:  fmt.Sprintf("%s (%s, build %d)", d.Slug, d.WoWVersion, d.BuildVersion),
			}
		}
		dsIdx, err := runSingleSelect("Select a dataset to import into:", dsItems)
		if err != nil {
			return nil, err
		}
		chosen = datasets[dsIdx]
	}

	// 2. Confirmation guard with affected tenants.
	tenants, err := fetchDatasetTenants(baseURL, token, chosen.ID.String())
	if err != nil {
		return nil, fmt.Errorf("fetch tenants: %w", err)
	}
	tenantNote := "no tenants explicitly use this dataset"
	if len(tenants) > 0 {
		names := make([]string, len(tenants))
		for i, t := range tenants {
			names[i] = t.Name
		}
		tenantNote = strings.Join(names, ", ")
	}

	guardTitle := fmt.Sprintf("Dataset %q selected.\nAffected tenants: %s", chosen.Name, tenantNote)
	guardIdx, err := runSingleSelect(guardTitle, []listItem{
		{label: "Yes, import all", desc: "run every selected importer"},
		{label: "Yes, select imports", desc: "choose which importers to run"},
		{label: "Cancel", desc: "abort without importing"},
	})
	if err != nil {
		return nil, err
	}

	switch guardChoice(guardIdx) {
	case guardAll:
		return &interactiveResult{datasetID: chosen.ID.String(), importers: defaultImporters}, nil
	case guardSome:
		picked, err := pickImporters(defaultImporters)
		if err != nil {
			return nil, err
		}
		return &interactiveResult{datasetID: chosen.ID.String(), importers: picked}, nil
	default:
		return nil, errCanceled
	}
}

// pickImporters shows a multi-select of all registered importers, pre-checking
// the ones in defaultImporters.
func pickImporters(defaultImporters []Importer) ([]Importer, error) {
	all := Registry()
	defaultKeys := make(map[string]bool, len(defaultImporters))
	for _, imp := range defaultImporters {
		defaultKeys[imp.Key()] = true
	}

	items := make([]listItem, len(all))
	preselected := map[int]bool{}
	for i, imp := range all {
		files := make([]string, 0, len(imp.RequiredFiles()))
		for _, f := range imp.RequiredFiles() {
			files = append(files, string(f))
		}
		items[i] = listItem{label: imp.Name(), desc: strings.Join(files, ", ")}
		if defaultKeys[imp.Key()] {
			preselected[i] = true
		}
	}

	idxs, err := runMultiSelect("Select importers to run:", items, preselected)
	if err != nil {
		return nil, err
	}
	if len(idxs) == 0 {
		return nil, fmt.Errorf("no importers selected")
	}
	out := make([]Importer, len(idxs))
	for i, idx := range idxs {
		out[i] = all[idx]
	}
	return out, nil
}
