package serviceratings

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const WorkPages = 10
const WorkYield = time.Second

// continueWork holds no transaction across pages. Snooze reschedules this SAME
// River job, avoiding a self-insert deduplicating against its running identity.
func continueWork(ctx context.Context, page func(context.Context) (bool, error), due func(context.Context) (bool, error)) error {
	for range WorkPages {
		if err := ctx.Err(); err != nil {
			return err
		}
		productive, err := page(ctx)
		if err != nil {
			return err
		}
		if !productive {
			return nil
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	ready, err := due(ctx)
	if err != nil {
		return err
	}
	if ready {
		return river.JobSnooze(WorkYield)
	}
	return nil
}

// Nudge failure never undoes already committed publication or its counters.
// Pending work remains durable and periodic dispatch recovers missed nudges.
func nudgeDownstream(ctx context.Context, queue JobInserter, metrics *Metrics, tenant uuid.UUID, includeD1 bool) {
	if queue == nil || ctx.Err() != nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	insert := func(args river.JobArgs, family string) {
		_, err := queue.Insert(ctx, args, nil)
		outcome := "success"
		if err != nil {
			outcome = "failed"
		}
		metrics.event(tenant, family, "dispatch_nudge", outcome, 1)
	}
	if includeD1 {
		insert(ArgsRepair{TenantID: tenant}, "runs")
	}
	insert(ArgsCareerDrain{TenantID: tenant}, "careers")
	for family := Family(0); family < familyCount; family++ {
		if ctx.Err() != nil {
			return
		}
		insert(ArgsDrain{TenantID: tenant, Family: family}, metricFamilies[family])
	}
}
