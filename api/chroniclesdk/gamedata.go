package chroniclesdk

// WDBUploadResponse is the response from uploading a WDB cache file.
type WDBUploadResponse struct {
	Signature   string         `json:"signature"`
	Version     uint32         `json:"version"`
	RecordCount int            `json:"record_count"`
	Mode        string         `json:"mode"`
	NewItems    int            `json:"new_items"`
	Changed     int            `json:"changed"`
	Unchanged   int            `json:"unchanged"`
	Diffs       []WDBItemDiff  `json:"diffs"`
}

// WDBItemDiff describes changes for one item entry.
type WDBItemDiff struct {
	Entry  int32          `json:"entry"`
	Name   string         `json:"name"`
	Status string         `json:"status"` // "new", "changed", "unchanged"
	Fields []WDBFieldDiff `json:"fields,omitempty"`
}

// WDBFieldDiff describes a single changed field.
type WDBFieldDiff struct {
	Field      string `json:"field"`
	Old        any    `json:"old"`
	New        any    `json:"new"`
	Unreliable bool   `json:"unreliable,omitempty"`
}
