package serviceinference

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"github.com/Emyrk/chronicle/internal/instancesearch"
)

const maxSearchLinkLength = 4096

// validateSearchDraft checks the query tree without executing a search or building a URL.
func validateSearchDraft(raw json.RawMessage) error {
	var node instancesearch.Node
	if err := decodeStrict(string(raw), &node); err != nil {
		return err
	}
	_, err := instancesearch.Compile(instancesearch.Query{Where: &node}, instancesearch.Options{})
	return err
}

func describeInstanceSearch(args string) (string, error) {
	var in struct{}
	if err := decodeStrict(args, &in); err != nil {
		return "", err
	}
	return boundedJSON(instancesearch.Describe())
}

func buildInstanceSearchLink(args string) (string, error) {
	var in struct {
		Where *instancesearch.Node `json:"where"`
	}
	if err := decodeStrict(args, &in); err != nil {
		return "", err
	}
	if in.Where == nil {
		return "", errors.New("where is required")
	}
	if _, err := instancesearch.Compile(instancesearch.Query{Where: in.Where}, instancesearch.Options{}); err != nil {
		return "", err
	}
	searchPath, err := instanceSearchPath(in.Where)
	if err != nil {
		return "", err
	}
	return boundedJSON(struct {
		URL string `json:"url"`
	}{URL: searchPath})
}

func instanceSearchPath(where *instancesearch.Node) (string, error) {
	raw, err := json.Marshal(where)
	if err != nil {
		return "", err
	}
	var url strings.Builder
	url.WriteString("/search?q=")
	url.WriteString(base64.RawURLEncoding.EncodeToString(raw))
	if url.Len() > maxSearchLinkLength {
		return "", errors.New("search link is too long")
	}
	return url.String(), nil
}
