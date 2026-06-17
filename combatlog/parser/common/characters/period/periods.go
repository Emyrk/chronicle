package period

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type Hook interface {
	OnActivityChange(m messages.Message)
}

type hookFunction struct {
	f func(m messages.Message)
}

func HookFunction(f func(m messages.Message)) Hook {
	return &hookFunction{f: f}
}

func (h *hookFunction) OnActivityChange(m messages.Message) {
	h.f(m)
}

// PeriodCollector accumulates periods over time. Periods may start/end and later
// start/end again; the collector simply appends each new period to History.
type PeriodCollector[M IsPeriod] struct {
	History []M
	hook    Hook
}

func (pc *PeriodCollector[M]) WithHook(hook Hook) *PeriodCollector[M] {
	pc.hook = hook
	return pc
}

func (pc *PeriodCollector[M]) Current() (M, bool) {
	if len(pc.History) == 0 {
		var m M
		return m, false
	}
	return pc.History[len(pc.History)-1], true
}

func (pc *PeriodCollector[M]) IsActive() bool {
	cur, ok := pc.Current()
	if !ok {
		return false
	}
	return cur.IsActive()
}

// Start appends a new period. Returns false if a period is already active.
func (pc *PeriodCollector[M]) Start(p M, reason string, m messages.Message) {
	if pc.IsActive() {
		pc.Bump(reason, m)
		return
	}

	p.SetHook(pc.hook)
	p.Begin(reason, m)
	pc.History = append(pc.History, p)
	if pc.hook != nil {
		pc.hook.OnActivityChange(m)
	}
}

// End ends the current period if one is active with the given end state.
func (pc *PeriodCollector[M]) End(reason string, m messages.Message, endState EndState) {
	cur, ok := pc.Current()
	if !ok {
		return
	}
	if !cur.IsActive() {
		return
	}
	cur.End(reason, m, endState)
	if pc.hook != nil {
		pc.hook.OnActivityChange(m)
	}
}

func (pc *PeriodCollector[M]) Bump(reason string, m messages.Message) {
	cur, ok := pc.Current()
	if !ok {
		return
	}
	cur.Bump(reason, m)
}

// Timeout ends the current period due to inactivity (or other timeout reasons).
func (pc *PeriodCollector[M]) Timeout(reason string, now time.Time) {
	cur, ok := pc.Current()
	if !ok {
		return
	}
	if !cur.IsActive() {
		return
	}
	cur.Timeout(reason, now)
	if pc.hook != nil {
		pc.hook.OnActivityChange(messages.TimedOut(now))
	}
}

func (pc *PeriodCollector[M]) String() string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("%d Periods", len(pc.History)))
	str.WriteString(fmt.Sprintf(", Active=%t", pc.IsActive()))
	if prd, ok := pc.Current(); ok && prd.IsActive() {
		tmp := prd.Get().LastActive
		str.WriteString(fmt.Sprintf(", LatAct=%s", tmp.String()))
	}

	str.WriteString("\n")
	for _, p := range pc.History {
		str.WriteString(fmt.Sprintf("  %s\n", p.String()))
	}

	return str.String()
}
