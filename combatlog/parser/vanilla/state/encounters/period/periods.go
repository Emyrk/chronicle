package period

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

//func x() {
//	y := NewCollector[*InactivityPeriod]()
//	p, ok := y.Current()
//	p.HandleTimeout()
//}

func NewCollector[M IsPeriod]() *PeriodCollector[M] {
	return &PeriodCollector[M]{
		History: make([]M, 0),
	}
}

// PeriodCollector accumulates periods over time. Periods may start/end and later
// start/end again; the collector simply appends each new period to History.
type PeriodCollector[M IsPeriod] struct {
	History []M
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

	p.Begin(reason, m)
	pc.History = append(pc.History, p)
	return
}

// End ends the current period if one is active.
func (pc *PeriodCollector[M]) End(reason string, m messages.Message) {
	cur, ok := pc.Current()
	if !ok {
		return
	}
	cur.Close(reason, m)
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
	cur.Timeout(reason, now)
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
