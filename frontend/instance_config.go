package frontend

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed instance-config.json
var instanceConfigJSON []byte

type instanceConfig struct {
	Background string `json:"background"`
}

var instanceConfigs = func() map[string]instanceConfig {
	var configs map[string]instanceConfig
	if err := json.Unmarshal(instanceConfigJSON, &configs); err != nil {
		panic("decode embedded instance config: " + err.Error())
	}
	return configs
}()

const (
	loadingScreenPrefix   = "/c/images/loadingscreens/"
	ogLoadingScreenPrefix = "/c/images/og/loadingscreens/"
)

// InstanceBackground returns the configured loading-screen path for an instance.
func InstanceBackground(name string) (string, bool) {
	if config, ok := instanceConfigs[name]; ok {
		return config.Background, config.Background != ""
	}

	for canonical, config := range instanceConfigs {
		if strings.EqualFold(canonical, name) {
			return config.Background, config.Background != ""
		}
	}
	return "", false
}

// InstanceOGImage returns a wide, cropped loading-screen path for social previews.
func InstanceOGImage(name string) (string, bool) {
	background, ok := InstanceBackground(name)
	if !ok || !strings.HasPrefix(background, loadingScreenPrefix) || !strings.HasSuffix(background, ".webp") {
		return "", false
	}

	filename := strings.TrimSuffix(strings.TrimPrefix(background, loadingScreenPrefix), ".webp")
	if filename == "" || strings.Contains(filename, "/") {
		return "", false
	}
	return ogLoadingScreenPrefix + filename + ".jpg", true
}
