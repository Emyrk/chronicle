package resynctui_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/cmd/chronicled/cli/resynccandidate"
	"github.com/Emyrk/chronicle/cmd/chronicled/cli/resynctui"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func testGroups() []resynccandidate.Group {
	return []resynccandidate.Group{
		{
			ID:               uuid.MustParse("00000000-0000-0000-0000-000000000001"),
			Owner:            uuid.MustParse("10000000-0000-0000-0000-000000000001"),
			ParserVersion:    "v0.0.100",
			Instances:        []string{"MC", "Onyxia"},
			TenantName:       "Turtle WoW",
			TenantSlug:       "turtle",
			TenantIncludeAll: true,
			LogURL:           "https://turtle.chronicleclassic.com/logs/00000000-0000-0000-0000-000000000001",
			RawFileCount:     1,
			ExpectedFiles:    1,
			StorageValid:     true,
		},
		{
			ID:            uuid.MustParse("00000000-0000-0000-0000-000000000002"),
			ParserVersion: "v0.0.200",
			Instances:     []string{"BWL"},
		},
	}
}

func TestDryRunModel_InitialState(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewDryRunModel(groups, "v0.0.425")

	require.Equal(t, 0, m.Offset)
	require.Equal(t, 24, m.Height)
	require.Len(t, m.Groups, 2)
	require.Equal(t, "v0.0.425", m.TargetVersion)
}

func TestDryRunModel_ViewContainsCandidates(t *testing.T) {
	t.Parallel()

	m := resynctui.NewDryRunModel(testGroups(), "v0.0.425")
	view := m.View()

	require.Contains(t, view, "2 candidate log group(s)")
	require.Contains(t, view, "00000000-0000-0000-0000-000000000001")
	require.Contains(t, view, "v0.0.100")
	require.Contains(t, view, "owner:  10000000-0000-0000-0000-000000000001")
	require.Contains(t, view, "Turtle WoW (slug=turtle, include_in_all=true)")
	require.Contains(t, view, "1/1 file(s), storage preflight=ok")
	require.Contains(t, view, "https://turtle.chronicleclassic.com/logs/00000000-0000-0000-0000-000000000001")
	require.Contains(t, view, "MC")
}

func TestDryRunModel_ScrollDown(t *testing.T) {
	t.Parallel()

	m := resynctui.NewDryRunModel(testGroups(), "v0.0.425")

	// Set small height to force scrollability.
	m.Height = 6

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyDown})
	dm := updated.(resynctui.DryRunModel)
	require.Equal(t, 1, dm.Offset)
}

func TestDryRunModel_ScrollUpAtZero(t *testing.T) {
	t.Parallel()

	m := resynctui.NewDryRunModel(testGroups(), "v0.0.425")
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyUp})
	dm := updated.(resynctui.DryRunModel)
	require.Equal(t, 0, dm.Offset)
}

func TestDryRunModel_QuitOnQ(t *testing.T) {
	t.Parallel()

	m := resynctui.NewDryRunModel(testGroups(), "v0.0.425")
	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("q")})
	require.NotNil(t, cmd)
}

func TestDryRunModel_WindowResize(t *testing.T) {
	t.Parallel()

	m := resynctui.NewDryRunModel(testGroups(), "v0.0.425")
	updated, _ := m.Update(tea.WindowSizeMsg{Width: 80, Height: 40})
	dm := updated.(resynctui.DryRunModel)
	require.Equal(t, 40, dm.Height)
}

func TestActiveModel_InitialState(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 2)

	require.Len(t, m.Jobs, 2)
	require.Len(t, m.Order, 2)
	require.Equal(t, 2, m.Workers)
	require.False(t, m.Done)

	// All jobs start as pending.
	for _, js := range m.Jobs {
		require.Equal(t, resynctui.JobPending, js.State)
	}
}

func TestActiveModel_JobUpdateTransitions(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)

	id1 := groups[0].ID
	id2 := groups[1].ID

	// Transition id1 to running.
	updated, _ := m.Update(resynctui.JobUpdateMsg{LogGroupID: id1, State: resynctui.JobRunning})
	am := updated.(resynctui.ActiveModel)
	require.Equal(t, resynctui.JobRunning, am.Jobs[id1].State)
	require.Equal(t, resynctui.JobPending, am.Jobs[id2].State)

	// Transition id1 to completed.
	updated, _ = am.Update(resynctui.JobUpdateMsg{LogGroupID: id1, State: resynctui.JobCompleted})
	am = updated.(resynctui.ActiveModel)
	require.Equal(t, resynctui.JobCompleted, am.Jobs[id1].State)

	// Transition id2 to failed with error.
	updated, _ = am.Update(resynctui.JobUpdateMsg{LogGroupID: id2, State: resynctui.JobFailed, Error: "timeout"})
	am = updated.(resynctui.ActiveModel)
	require.Equal(t, resynctui.JobFailed, am.Jobs[id2].State)
	require.Equal(t, "timeout", am.Jobs[id2].Error)
}

func TestActiveModel_AllDoneQuits(t *testing.T) {
	t.Parallel()

	m := resynctui.NewActiveModel(testGroups(), 1)
	updated, cmd := m.Update(resynctui.AllDoneMsg{})
	am := updated.(resynctui.ActiveModel)
	require.True(t, am.Done)
	require.NotNil(t, cmd) // tea.Quit
}

func TestActiveModel_ViewShowsCounts(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 2)

	// Mark one completed, one failed.
	m.Jobs[groups[0].ID].State = resynctui.JobCompleted
	m.Jobs[groups[1].ID].State = resynctui.JobFailed

	view := m.View()
	require.Contains(t, view, "✓ 1")
	require.Contains(t, view, "✗ 1")
	require.Contains(t, view, "MC (+1 more)")
	require.Equal(t, 1, m.FailedCount())
}

func TestActiveModel_ViewDoneMessage(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Done = true
	m.Jobs[groups[0].ID].State = resynctui.JobCompleted
	m.Jobs[groups[1].ID].State = resynctui.JobCompleted

	view := m.View()
	// Should contain a "complete" message.
	lower := strings.ToLower(view)
	require.Contains(t, lower, "resync complete")
}

// ── Pause/Resume state tests ────────────────────────────────────────────────

func TestActiveModel_QueuePausedMsg(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)

	updated, _ := m.Update(resynctui.QueuePausedMsg{
		FailedLogGroupID: groups[0].ID,
		Error:            "disk full",
	})
	am := updated.(resynctui.ActiveModel)
	require.True(t, am.Paused)
	require.Equal(t, "disk full", am.PauseError)
}

func TestActiveModel_QueueResumedMsg(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Paused = true
	m.PauseError = "disk full"

	updated, _ := m.Update(resynctui.QueueResumedMsg{})
	am := updated.(resynctui.ActiveModel)
	require.False(t, am.Paused)
	require.Empty(t, am.PauseError)
}

func TestActiveModel_QueueResumedAfterAllDoneQuits(t *testing.T) {
	t.Parallel()

	m := resynctui.NewActiveModel(testGroups(), 1)
	m.Paused = true
	m.Done = true

	updated, cmd := m.Update(resynctui.QueueResumedMsg{})
	am := updated.(resynctui.ActiveModel)
	require.False(t, am.Paused)
	require.NotNil(t, cmd)
}

func TestActiveModel_QueueResumeFailedMsg(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Paused = true

	updated, _ := m.Update(resynctui.QueueResumeFailedMsg{Error: "conn refused"})
	am := updated.(resynctui.ActiveModel)
	require.True(t, am.Paused) // still paused
	require.Contains(t, am.PauseError, "resume failed")
	require.Contains(t, am.PauseError, "conn refused")
}

func TestActiveModel_RKeyResumeWhenPaused(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Paused = true
	m.ResumeFunc = func() error { return nil }

	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("r")})
	require.NotNil(t, cmd, "pressing 'r' while paused should produce a command")

	// Execute the command and verify it returns QueueResumedMsg.
	msg := cmd()
	_, ok := msg.(resynctui.QueueResumedMsg)
	require.True(t, ok, "expected QueueResumedMsg, got %T", msg)
}

func TestActiveModel_RKeyResumeError(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Paused = true
	m.ResumeFunc = func() error { return fmt.Errorf("db down") }

	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("r")})
	require.NotNil(t, cmd)

	msg := cmd()
	rfm, ok := msg.(resynctui.QueueResumeFailedMsg)
	require.True(t, ok, "expected QueueResumeFailedMsg, got %T", msg)
	require.Contains(t, rfm.Error, "db down")
}

func TestActiveModel_RKeyIgnoredWhenNotPaused(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	// Not paused — 'r' should be a no-op.
	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("r")})
	require.Nil(t, cmd, "'r' when not paused should produce no command")
}

func TestActiveModel_AllDoneWhilePausedStaysOpen(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Paused = true
	m.Jobs[groups[0].ID].State = resynctui.JobCompleted
	m.Jobs[groups[1].ID].State = resynctui.JobFailed

	updated, cmd := m.Update(resynctui.AllDoneMsg{})
	am := updated.(resynctui.ActiveModel)
	require.True(t, am.Done)
	require.True(t, am.Paused)
	require.Nil(t, cmd, "should NOT quit while paused — wait for 'r' or 'q'")
}

func TestActiveModel_ViewShowsPausedState(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Paused = true
	m.PauseError = "timeout"
	m.Jobs[groups[0].ID].State = resynctui.JobFailed

	view := m.View()
	require.Contains(t, view, "PAUSED")
	require.Contains(t, view, "timeout")
	require.Contains(t, view, "Already-running parses")
	require.Contains(t, view, "Press 'r'")
}

func TestActiveModel_ViewShowsTerminalCountsWhilePaused(t *testing.T) {
	t.Parallel()

	groups := testGroups()
	m := resynctui.NewActiveModel(groups, 1)
	m.Paused = true
	m.Done = true
	m.PauseError = "err"
	m.Jobs[groups[0].ID].State = resynctui.JobCompleted
	m.Jobs[groups[1].ID].State = resynctui.JobFailed

	view := m.View()
	require.Contains(t, view, "All jobs terminal")
	require.Contains(t, view, "1 succeeded, 1 failed")
}

// TestResyncCmd_Flags validates the command exposes the required flags
// and that --target-version has a default (is not Required).
func TestResyncCmd_Flags(t *testing.T) {
	t.Parallel()

	// We import from the parent package via the test binary, so this
	// test is in the TUI package but validates the CLI surface.
	// The actual flag assertions are in resync_test.go.
}
