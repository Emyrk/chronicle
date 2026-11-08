package frontend

import (
	_ "embed"
	"encoding/json"
)

//go:embed chronicle/src/pages/InstanceSearch/celCheatsheet.json
var celCheatsheetJSON []byte

// CELCheatsheet is the search syntax by example, as [code, note] pairs. The
// search guide and code editor show the same file, so /llms.txt and the guide
// can't drift apart. The last entry is a syntax summary, not a query.
func CELCheatsheet() [][2]string {
	var out [][2]string
	if err := json.Unmarshal(celCheatsheetJSON, &out); err != nil {
		panic("frontend: parse celCheatsheet.json: " + err.Error())
	}
	return out
}
