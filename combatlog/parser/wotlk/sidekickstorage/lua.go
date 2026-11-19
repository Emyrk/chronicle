package sidekickstorage

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/Emyrk/chronicle/internal/luadata"
)

func parseSavedVariables(ctx context.Context, input string) (luadata.Value, error) {
	p, err := luadata.NewParser(ctx, input)
	if err != nil {
		return luadata.Value{}, err
	}
	var legacy luadata.Value
	for {
		name, value, err := p.NextAssignment()
		if errors.Is(err, io.EOF) {
			if legacy.Kind == luadata.Table {
				return legacy, nil
			}
			return luadata.Value{}, fmt.Errorf("ChronicleSidekickBridgeWoTLKDB assignment not found")
		}
		if err != nil {
			return luadata.Value{}, err
		}
		switch name {
		case "ChronicleSidekickBridgeWoTLKDB":
			if value.Kind != luadata.Table {
				return luadata.Value{}, fmt.Errorf("ChronicleSidekickBridgeWoTLKDB must be a table")
			}
			return value, nil
		case "ChronicleCompanionWoTLKDB":
			if value.Kind != luadata.Table {
				return luadata.Value{}, fmt.Errorf("ChronicleCompanionWoTLKDB must be a table")
			}
			legacy = value
		}
	}
}
