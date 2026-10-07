package chroniclesdk

// CustomPanelResolveRequest identifies a public GitHub repository and a mutable
// ref to resolve to an immutable custom-panel installation.
type CustomPanelResolveRequest struct {
	Repository string `json:"repository"`
	Ref        string `json:"ref"`
}

// CustomPanelResolveResponse describes a validated custom-panel installation.
type CustomPanelResolveResponse struct {
	Repository     string                 `json:"repository"`
	CommitSHA      string                 `json:"commit_sha"`
	Manifest       CustomPanelManifest    `json:"manifest"`
	ManifestSHA256 string                 `json:"manifest_sha256"`
	Artifacts      CustomPanelArtifactSet `json:"artifacts"`
}

type CustomPanelManifest struct {
	SchemaVersion int                          `json:"schema_version"`
	Plugin        CustomPanelManifestPlugin    `json:"plugin"`
	Host          CustomPanelManifestHost      `json:"host"`
	Artifacts     CustomPanelManifestArtifacts `json:"artifacts"`
	Panels        []CustomPanelManifestPanel   `json:"panels"`
}

type CustomPanelManifestPlugin struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description,omitempty"`
	Homepage    string `json:"homepage,omitempty"`
}

type CustomPanelManifestHost struct {
	APIVersion int `json:"api_version"`
}

type CustomPanelManifestArtifacts struct {
	Entry  CustomPanelManifestArtifact  `json:"entry"`
	Worker *CustomPanelManifestArtifact `json:"worker,omitempty"`
	Styles *CustomPanelManifestArtifact `json:"styles,omitempty"`
}

type CustomPanelManifestArtifact struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type CustomPanelManifestPanel struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Streams     []WoWEventType `json:"streams"`
	Worker      bool           `json:"worker,omitempty"`
}

type CustomPanelArtifactSet struct {
	Entry  CustomPanelArtifact  `json:"entry"`
	Worker *CustomPanelArtifact `json:"worker,omitempty"`
	Styles *CustomPanelArtifact `json:"styles,omitempty"`
}

type CustomPanelArtifact struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type CustomPanelInstallation struct {
	Repository     string                 `json:"repository"`
	CommitSHA      string                 `json:"commitSha"`
	InstalledRef   string                 `json:"installedRef"`
	Manifest       CustomPanelManifest    `json:"manifest"`
	ManifestSHA256 string                 `json:"manifestSha256"`
	Artifacts      CustomPanelArtifactSet `json:"artifacts"`
	Enabled        bool                   `json:"enabled"`
	InstalledAt    string                 `json:"installedAt"`
	UpdatedAt      string                 `json:"updatedAt"`
}

type CustomPanelSettings struct {
	Enabled       bool                      `json:"enabled"`
	Installations []CustomPanelInstallation `json:"installations"`
	Revision      int64                     `json:"revision"`
	UpdatedAt     string                    `json:"updated_at,omitempty"`
}

type AdminActiveCustomPanelInstallation struct {
	UserID        string   `json:"user_id"`
	Username      string   `json:"username"`
	Repository    string   `json:"repository"`
	CommitSHA     string   `json:"commit_sha"`
	InstalledRef  string   `json:"installed_ref"`
	PluginName    string   `json:"plugin_name"`
	PluginVersion string   `json:"plugin_version"`
	PanelNames    []string `json:"panel_names"`
	InstalledAt   string   `json:"installed_at"`
	UpdatedAt     string   `json:"updated_at"`
}

type AdminActiveCustomPanelsResponse struct {
	Installations []AdminActiveCustomPanelInstallation `json:"installations"`
}

type UpdateCustomPanelSettingsRequest struct {
	Enabled          bool                      `json:"enabled"`
	Installations    []CustomPanelInstallation `json:"installations"`
	ExpectedRevision int64                     `json:"expected_revision"`
}
