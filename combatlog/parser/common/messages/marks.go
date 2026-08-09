package messages

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

const (
	MarkTypeBump           MarkType = "bump"
	MarkTypeStart          MarkType = "start"
	MarkTypeIgnoreActivity MarkType = "ignore_activity"
)

type MarkType string

type Mark struct {
	Type    MarkType             `json:"type"`
	Targets map[guid.GUID]string `json:"targets"`
}

type marks map[MarkType]Mark

func (m *marks) MarkActivityStart(reason string, target guid.GUID) {
	m.MarkAdd(Mark{
		Type:    MarkTypeStart,
		Targets: map[guid.GUID]string{target: reason},
	})
}

func (m *marks) MarkActivityBump(reason string, target guid.GUID) {
	m.MarkAdd(Mark{
		Type:    MarkTypeBump,
		Targets: map[guid.GUID]string{target: reason},
	})
}

func (m *marks) MarkActivityIgnore(reason string, target guid.GUID) {
	m.MarkAdd(Mark{
		Type:    MarkTypeIgnoreActivity,
		Targets: map[guid.GUID]string{target: reason},
	})
}

func (m *marks) MarkAdd(mark Mark) {
	if *m == nil {
		*m = make(map[MarkType]Mark)
	}

	if existing, ok := (*m)[mark.Type]; ok {
		for k, v := range mark.Targets {
			existing.Targets[k] = v
		}
		return
	}

	(*m)[mark.Type] = mark
}

func (m *marks) MarksExist() bool {
	return m != nil && len(*m) > 0
}

func (m *marks) MarkHas(markType MarkType, me guid.GUID) (string, bool) {
	if *m == nil {
		return "", false
	}
	mrk, ok := (*m)[markType]
	if !ok {
		return "", false
	}

	reason, ok := mrk.Targets[me]
	if !ok {
		return "", false
	}
	return reason, ok
}
