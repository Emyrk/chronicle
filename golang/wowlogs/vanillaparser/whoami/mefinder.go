package whoami

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/lines"
	"github.com/Emyrk/chronicle/golang/wowlogs/merge"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/unitinfo"
)

const (
	lineLimit = 500
)

type scanLine struct {
	Ts      time.Time
	Content string
}
type meFinder struct {
	Scan merge.Scan

	buffer []scanLine
}

func FindMe(liner *lines.Liner, scan merge.Scan) (merge.Scan, types.Unit, int, error) {
	finder := &meFinder{
		Scan:   scan,
		buffer: make([]scanLine, 0),
	}

	lineCount := 0
	for {
		ts, content, err := scan()
		if err != nil {
			return nil, types.Unit{}, lineCount, err
		}

		finder.buffer = append(finder.buffer, scanLine{
			Ts:      ts,
			Content: content,
		})

		lineCount++
		if lineCount > lineLimit {
			return nil, types.Unit{}, lineCount, fmt.Errorf("cannot find me within %d lines", lineLimit)
		}

		if _, ok := combatant.IsCombatant(content); ok {
			cmbt, err := combatant.ParseCombatantInfo(content)
			if err != nil {
				return nil, types.Unit{}, lineCount, err
			}

			if cmbt.IsMe() {
				return finder.scan, types.Unit{
					Name: cmbt.Name,
					Gid:  cmbt.Guid,
				}, lineCount, nil
			}
		}

		if _, ok := unitinfo.IsUnitInfo(content); ok {
			ui, err := unitinfo.ParseUnitInfo(content)
			if err != nil {
				return nil, types.Unit{}, lineCount, err
			}

			if ui.IsMe() {
				return finder.scan, types.Unit{
					Name: ui.Name,
					Gid:  ui.Guid,
				}, lineLimit, nil
			}
		}
	}
}

func (m *meFinder) scan() (time.Time, string, error) {
	if len(m.buffer) > 0 {
		line := m.buffer[0]
		m.buffer = m.buffer[1:]
		return line.Ts, line.Content, nil
	}
	return m.Scan()
}
