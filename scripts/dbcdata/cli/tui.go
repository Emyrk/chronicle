package cli

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("69"))
	cursorStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("212"))
	selectedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	helpStyle     = lipgloss.NewStyle().Faint(true)
)

// listItem is one row in a selection list.
type listItem struct {
	label string
	desc  string
}

// listModel is a reusable single- or multi-select list. When multi is false,
// Enter selects the cursor row and quits. When multi is true, Space toggles
// rows and Enter confirms the current toggles.
type listModel struct {
	title    string
	items    []listItem
	cursor   int
	multi    bool
	checked  map[int]bool
	chosen   int  // single-select result; -1 if none
	confirm  bool // multi-select confirmed
	canceled bool
}

func newSingleSelect(title string, items []listItem) *listModel {
	return &listModel{title: title, items: items, chosen: -1, checked: map[int]bool{}}
}

func newMultiSelect(title string, items []listItem, preselected map[int]bool) *listModel {
	if preselected == nil {
		preselected = map[int]bool{}
	}
	return &listModel{title: title, items: items, multi: true, chosen: -1, checked: preselected}
}

func (m *listModel) Init() tea.Cmd { return nil }

func (m *listModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	key, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}
	switch key.String() {
	case "ctrl+c", "q", "esc":
		m.canceled = true
		return m, tea.Quit
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < len(m.items)-1 {
			m.cursor++
		}
	case " ":
		if m.multi {
			m.checked[m.cursor] = !m.checked[m.cursor]
		}
	case "enter":
		if m.multi {
			m.confirm = true
		} else {
			m.chosen = m.cursor
		}
		return m, tea.Quit
	}
	return m, nil
}

func (m *listModel) View() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render(m.title) + "\n\n")
	for i, it := range m.items {
		cursor := "  "
		if i == m.cursor {
			cursor = cursorStyle.Render("> ")
		}
		line := it.label
		if m.multi {
			box := "[ ]"
			if m.checked[i] {
				box = selectedStyle.Render("[x]")
			}
			line = box + " " + line
		}
		if it.desc != "" {
			line += helpStyle.Render("  — " + it.desc)
		}
		b.WriteString(cursor + line + "\n")
	}
	help := "↑/↓ move • enter select • q cancel"
	if m.multi {
		help = "↑/↓ move • space toggle • enter confirm • q cancel"
	}
	b.WriteString("\n" + helpStyle.Render(help) + "\n")
	return b.String()
}

// runSingleSelect runs a single-select prompt and returns the chosen index,
// or an error if the user canceled.
func runSingleSelect(title string, items []listItem) (int, error) {
	m := newSingleSelect(title, items)
	final, err := tea.NewProgram(m).Run()
	if err != nil {
		return -1, err
	}
	fm := final.(*listModel)
	if fm.canceled || fm.chosen < 0 {
		return -1, errCanceled
	}
	return fm.chosen, nil
}

// runMultiSelect runs a multi-select prompt and returns the checked indices.
func runMultiSelect(title string, items []listItem, preselected map[int]bool) ([]int, error) {
	m := newMultiSelect(title, items, preselected)
	final, err := tea.NewProgram(m).Run()
	if err != nil {
		return nil, err
	}
	fm := final.(*listModel)
	if fm.canceled || !fm.confirm {
		return nil, errCanceled
	}
	var out []int
	for i := range fm.items {
		if fm.checked[i] {
			out = append(out, i)
		}
	}
	return out, nil
}

var errCanceled = fmt.Errorf("canceled")
