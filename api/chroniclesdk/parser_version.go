package chroniclesdk

// ParserVersionResponse is returned by GET /api/v1/parser-version.
type ParserVersionResponse struct {
	Version string `json:"version"`
}
