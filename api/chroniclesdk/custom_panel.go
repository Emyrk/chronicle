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
	Entry  string `json:"entry"`
	Worker string `json:"worker,omitempty"`
	Styles string `json:"styles,omitempty"`
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
