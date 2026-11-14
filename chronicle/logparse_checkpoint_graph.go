package chronicle

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore"
	"github.com/Emyrk/chronicle/combatlog/parser/blizzard/modern"
	"github.com/Emyrk/chronicle/combatlog/parser/common/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type completeSessionRoot struct {
	source any
	result *parseResult
}
type completeSessionValue struct {
	Source       string   `json:"source"`
	Consumers    string   `json:"consumers"`
	Encounters   string   `json:"encounters"`
	Creatures    string   `json:"creatures"`
	Capabilities []string `json:"capabilities"`
	Lines        int64    `json:"lines"`
}

func registerCompleteSessionRoot(r *ownergraph.Registry, identity SessionCompatibility) error {
	validate := func(root *completeSessionRoot) error {
		if root.result == nil || root.result.encountersState == nil || root.result.consumers == nil || (root.result.creaturesState != nil) != identity.IdentityMode || root.result.report.totalLines < 0 {
			return fmt.Errorf("incomplete session root")
		}
		expected := []consumers.Consumer{root.result.encountersState}
		if identity.IdentityMode {
			expected = append(expected, root.result.creaturesState)
		}
		if err := root.result.consumers.ValidateGraphOrder(expected...); err != nil {
			return err
		}
		switch identity.Source.Format {
		case database.LogFormat112aCcAddon:
			if _, ok := root.source.(*nextsource.Pipeline); !ok {
				return fmt.Errorf("wrong vanilla session source")
			}
		case database.LogFormat243CcAddon, database.LogFormat335aCcAddon:
			if _, ok := root.source.(*wotlk.NextPipeline); !ok {
				return fmt.Errorf("wrong CLEU session source")
			}
		case database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
			if _, ok := root.source.(*modern.NextPipeline); !ok {
				return fmt.Errorf("wrong modern session source")
			}
		case database.LogFormatAzerothcoreMod:
			if _, ok := root.source.(*azerothcore.NextPipeline); !ok {
				return fmt.Errorf("wrong AzerothCore session source")
			}
		default:
			return fmt.Errorf("unsupported checkpoint format")
		}
		return nil
	}
	return ownergraph.Register(r, ownergraph.Codec[completeSessionRoot]{Type: "chronicle.complete-file-session", Version: 1, Init: func() *completeSessionRoot { return new(completeSessionRoot) }, Capture: func(root *completeSessionRoot, c *ownergraph.Capture) ([]byte, error) {
		if err := validate(root); err != nil {
			return nil, err
		}
		value := completeSessionValue{Capabilities: root.result.logCapabilities, Lines: root.result.report.totalLines}
		for _, ref := range []struct {
			owner any
			dest  *string
		}{{root.source, &value.Source}, {root.result.consumers, &value.Consumers}, {root.result.encountersState, &value.Encounters}} {
			path, err := c.Ref(ref.owner)
			if err != nil {
				return nil, err
			}
			*ref.dest = path
		}
		if root.result.creaturesState != nil {
			path, err := c.Ref(root.result.creaturesState)
			if err != nil {
				return nil, err
			}
			value.Creatures = path
		}
		return json.Marshal(value)
	}, Restore: func(root *completeSessionRoot, version uint32, data []byte, c *ownergraph.Restore) error {
		if version != 1 {
			return fmt.Errorf("unsupported session root version")
		}
		var value completeSessionValue
		if err := strictCheckpointJSON(data, &value); err != nil {
			return err
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(data, &fields); err != nil {
			return err
		}
		for _, name := range []string{"source", "consumers", "encounters", "creatures", "capabilities", "lines"} {
			if len(fields[name]) == 0 {
				return fmt.Errorf("missing session root field %s", name)
			}
		}
		var err error
		root.result = &parseResult{logCapabilities: value.Capabilities, report: parseTimingReport{totalLines: value.Lines}}
		switch identity.Source.Format {
		case database.LogFormat112aCcAddon:
			root.source, err = ownergraph.LoadAs[*nextsource.Pipeline](c, value.Source)
		case database.LogFormat243CcAddon, database.LogFormat335aCcAddon:
			root.source, err = ownergraph.LoadAs[*wotlk.NextPipeline](c, value.Source)
		case database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
			root.source, err = ownergraph.LoadAs[*modern.NextPipeline](c, value.Source)
		case database.LogFormatAzerothcoreMod:
			root.source, err = ownergraph.LoadAs[*azerothcore.NextPipeline](c, value.Source)
		default:
			return fmt.Errorf("unsupported checkpoint format")
		}
		if err != nil {
			return err
		}
		root.result.consumers, err = ownergraph.LoadAs[*consumers.Consumers](c, value.Consumers)
		if err != nil {
			return err
		}
		root.result.encountersState, err = ownergraph.LoadAs[*encounters.State](c, value.Encounters)
		if err != nil {
			return err
		}
		if value.Creatures != "" {
			root.result.creaturesState, err = ownergraph.LoadAs[*creatures.Creatures](c, value.Creatures)
			if err != nil {
				return err
			}
		}
		return validate(root)
	}, Validate: validate})
}
