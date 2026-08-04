// Package resynctui provides Bubble Tea models for the resync command's
// dry-run and active (execute) modes.
package resynctui

import (
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/cmd/chronicled/cli/resynccandidate"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/google/uuid"
)

// ── Styles ──────────────────────────────────────────────────────────────────

var (
	titleStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("12"))
	okStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	failStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("9"))
	dimStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	workingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("11"))
)

// ── Dry-run model ───────────────────────────────────────────────────────────

// DryRunModel displays a scrollable list of candidate log groups.
type DryRunModel struct {
	Groups        []resynccandidate.Group
	TargetVersion string
	Offset        int // scroll offset
	Height        int // terminal height
}

func NewDryRunModel(groups []resynccandidate.Group, targetVersion string) DryRunModel {
	return DryRunModel{
		Groups:        groups,
		TargetVersion: targetVersion,
		Height:        24,
	}
}

func (m DryRunModel) Init() tea.Cmd { return nil }

func (m DryRunModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc", "ctrl+c":
			return m, tea.Quit
		case "down", "j":
			if m.Offset < m.maxOffset() {
				m.Offset++
			}
		case "up", "k":
			if m.Offset > 0 {
				m.Offset--
			}
		case "pgdown":
			m.Offset += m.viewportLines()
			if m.Offset > m.maxOffset() {
				m.Offset = m.maxOffset()
			}
		case "pgup":
			m.Offset -= m.viewportLines()
			if m.Offset < 0 {
				m.Offset = 0
			}
		}
	case tea.WindowSizeMsg:
		m.Height = msg.Height
	}
	return m, nil
}

func (m DryRunModel) View() string {
	var b strings.Builder
	header := titleStyle.Render(fmt.Sprintf(
		"Resync dry-run: %d candidate log group(s) (target >= %s)",
		len(m.Groups), m.TargetVersion,
	))
	b.WriteString(header)
	b.WriteString("\n\n")

	var lines []string
	for idx, g := range m.Groups {
		lines = append(lines, fmt.Sprintf("  %d. %s  parser=%s  instances=%d",
			idx+1, g.ID, g.ParserVersion, len(g.Instances)))
		for _, inst := range g.Instances {
			lines = append(lines, fmt.Sprintf("       - %s", inst))
		}
	}

	vp := m.viewportLines()
	end := m.Offset + vp
	if end > len(lines) {
		end = len(lines)
	}
	start := m.Offset
	if start > len(lines) {
		start = len(lines)
	}
	for _, l := range lines[start:end] {
		b.WriteString(l)
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(dimStyle.Render("↑/↓ scroll • q quit"))
	if len(lines) > vp {
		b.WriteString(dimStyle.Render(fmt.Sprintf("  (%d-%d of %d lines)", start+1, end, len(lines))))
	}
	return b.String()
}

func (m DryRunModel) viewportLines() int {
	// Reserve 4 lines for header + footer.
	vp := m.Height - 4
	if vp < 1 {
		vp = 1
	}
	return vp
}

func (m DryRunModel) maxOffset() int {
	total := 0
	for _, g := range m.Groups {
		total += 1 + len(g.Instances)
	}
	max := total - m.viewportLines()
	if max < 0 {
		return 0
	}
	return max
}

// ── Active model ────────────────────────────────────────────────────────────

// JobState tracks the state of a single resync job.
type JobState int

const (
	JobPending JobState = iota
	JobRunning
	JobCompleted
	JobFailed
)

// JobStatus holds the current state and optional error for a resync job.
type JobStatus struct {
	LogGroupID uuid.UUID
	State      JobState
	Error      string
}

// JobUpdateMsg is sent when a River job's state changes.
type JobUpdateMsg struct {
	LogGroupID uuid.UUID
	State      JobState
	Error      string
}

// AllDoneMsg is sent when all jobs have reached terminal states.
type AllDoneMsg struct{}

// QueuePausedMsg is sent when the queue has been paused due to a failure.
// The FailedLogGroupID identifies the job that triggered the pause.
type QueuePausedMsg struct {
	FailedLogGroupID uuid.UUID
	Error            string
}

// QueueResumedMsg is sent after the operator presses 'r' and the resume
// callback succeeds.
type QueueResumedMsg struct{}

// QueueResumeFailedMsg is sent when the resume callback returns an error.
type QueueResumeFailedMsg struct {
	Error string
}

// ActiveModel displays progress for active resync execution.
type ActiveModel struct {
	Groups  []resynccandidate.Group
	Jobs    map[uuid.UUID]*JobStatus
	Order   []uuid.UUID
	Height  int
	Offset  int
	Done    bool
	Workers int

	// Paused is true when the queue has been paused due to a failure.
	// The TUI stays open and waits for the operator to press 'r'.
	Paused bool
	// PauseError holds the error message from the job that triggered the pause.
	PauseError string

	// ResumeFunc is called when the operator presses 'r' to resume.
	// It should call River QueueResume and return any error.
	// Nil means resume is not available (tests may leave it nil).
	ResumeFunc func() error
}

func NewActiveModel(groups []resynccandidate.Group, workers int) ActiveModel {
	jobs := make(map[uuid.UUID]*JobStatus, len(groups))
	order := make([]uuid.UUID, 0, len(groups))
	for _, g := range groups {
		jobs[g.ID] = &JobStatus{LogGroupID: g.ID, State: JobPending}
		order = append(order, g.ID)
	}
	return ActiveModel{
		Groups:  groups,
		Jobs:    jobs,
		Order:   order,
		Height:  24,
		Workers: workers,
	}
}

func (m ActiveModel) Init() tea.Cmd { return nil }

func (m ActiveModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc", "ctrl+c":
			return m, tea.Quit
		case "down", "j":
			if m.Offset < m.activeMaxOffset() {
				m.Offset++
			}
		case "up", "k":
			if m.Offset > 0 {
				m.Offset--
			}
		case "r":
			if m.Paused && m.ResumeFunc != nil {
				// Attempt resume in a command to avoid blocking the TUI.
				resumeFn := m.ResumeFunc
				return m, func() tea.Msg {
					if err := resumeFn(); err != nil {
						return QueueResumeFailedMsg{Error: err.Error()}
					}
					return QueueResumedMsg{}
				}
			}
		}
	case tea.WindowSizeMsg:
		m.Height = msg.Height
	case JobUpdateMsg:
		if js, ok := m.Jobs[msg.LogGroupID]; ok {
			js.State = msg.State
			js.Error = msg.Error
		}
	case QueuePausedMsg:
		m.Paused = true
		m.PauseError = msg.Error
	case QueueResumedMsg:
		m.Paused = false
		m.PauseError = ""
		if m.Done {
			return m, tea.Quit
		}
	case QueueResumeFailedMsg:
		// Stay paused; show the resume error.
		m.PauseError = fmt.Sprintf("resume failed: %s", msg.Error)
	case AllDoneMsg:
		m.Done = true
		if m.Paused {
			// All jobs terminal while paused: stay open for 'r' or 'q'.
			return m, nil
		}
		return m, tea.Quit
	}
	return m, nil
}

func (m ActiveModel) View() string {
	completed, failed, running, pending := m.counts()

	var b strings.Builder
	b.WriteString(titleStyle.Render("Resync progress"))
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("  Workers: %d  |  ", m.Workers))
	b.WriteString(okStyle.Render(fmt.Sprintf("✓ %d", completed)))
	b.WriteString("  ")
	b.WriteString(failStyle.Render(fmt.Sprintf("✗ %d", failed)))
	b.WriteString("  ")
	b.WriteString(workingStyle.Render(fmt.Sprintf("⟳ %d", running)))
	b.WriteString("  ")
	b.WriteString(dimStyle.Render(fmt.Sprintf("… %d", pending)))
	b.WriteString("\n\n")

	var lines []string
	for _, id := range m.Order {
		js := m.Jobs[id]
		var prefix string
		switch js.State {
		case JobPending:
			prefix = dimStyle.Render("  … ")
		case JobRunning:
			prefix = workingStyle.Render("  ⟳ ")
		case JobCompleted:
			prefix = okStyle.Render("  ✓ ")
		case JobFailed:
			prefix = failStyle.Render("  ✗ ")
		}
		line := fmt.Sprintf("%s%s  %s", prefix, id, m.groupLabel(id))
		if js.Error != "" {
			line += failStyle.Render(fmt.Sprintf("  %s", js.Error))
		}
		lines = append(lines, line)
	}

	vp := m.activeViewportLines()
	end := m.Offset + vp
	if end > len(lines) {
		end = len(lines)
	}
	start := m.Offset
	if start > len(lines) {
		start = len(lines)
	}
	for _, l := range lines[start:end] {
		b.WriteString(l)
		b.WriteString("\n")
	}

	if m.Paused {
		b.WriteString("\n")
		b.WriteString(failStyle.Render("⏸  PAUSED — queue paused after failure"))
		b.WriteString("\n")
		if m.PauseError != "" {
			b.WriteString(failStyle.Render(fmt.Sprintf("   Error: %s", m.PauseError)))
			b.WriteString("\n")
		}
		b.WriteString(dimStyle.Render("   Already-running parses will finish safely; no new jobs will start."))
		b.WriteString("\n")
		if m.Done {
			b.WriteString(dimStyle.Render(fmt.Sprintf("   All jobs terminal: %d succeeded, %d failed.", completed, failed)))
			b.WriteString("\n")
		}
		b.WriteString(workingStyle.Render("   Press 'r' to resume the queue, or 'q' to quit."))
		b.WriteString("\n")
	} else if m.Done {
		b.WriteString("\n")
		if failed > 0 {
			b.WriteString(failStyle.Render(fmt.Sprintf("Resync complete: %d succeeded, %d failed.", completed, failed)))
		} else {
			b.WriteString(okStyle.Render(fmt.Sprintf("Resync complete: all %d succeeded.", completed)))
		}
		b.WriteString("\n")
	}

	return b.String()
}

func (m ActiveModel) groupLabel(id uuid.UUID) string {
	for _, group := range m.Groups {
		if group.ID != id || len(group.Instances) == 0 {
			continue
		}
		if len(group.Instances) == 1 {
			return group.Instances[0]
		}
		return fmt.Sprintf("%s (+%d more)", group.Instances[0], len(group.Instances)-1)
	}
	return ""
}

func (m ActiveModel) counts() (completed, failed, running, pending int) {
	for _, js := range m.Jobs {
		switch js.State {
		case JobPending:
			pending++
		case JobRunning:
			running++
		case JobCompleted:
			completed++
		case JobFailed:
			failed++
		}
	}
	return
}

// FailedCount returns the number of jobs that reached a failed terminal state.
func (m ActiveModel) FailedCount() int {
	_, failed, _, _ := m.counts()
	return failed
}

func (m ActiveModel) activeViewportLines() int {
	vp := m.Height - 6
	if vp < 1 {
		vp = 1
	}
	return vp
}

func (m ActiveModel) activeMaxOffset() int {
	max := len(m.Order) - m.activeViewportLines()
	if max < 0 {
		return 0
	}
	return max
}
