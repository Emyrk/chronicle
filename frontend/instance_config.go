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
