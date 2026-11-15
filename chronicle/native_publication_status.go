package chronicle

import (
	"encoding/json"

	"github.com/Emyrk/chronicle/database"
	"github.com/riverqueue/river/rivertype"
)

func nativePublicationPending(state database.ParserHandoff, jobs []*rivertype.JobRow) bool {
	if !state.NativeEnabled {
		return false
	}
	if state.HeadIteration > state.PublishedIteration {
		return true
	}
	for _, job := range jobs {
		if job.Kind != KindNativeLogParse && job.Kind != KindFinalizeLogParse {
			continue
		}
		switch job.State {
		case rivertype.JobStateAvailable, rivertype.JobStatePending, rivertype.JobStateRunning, rivertype.JobStateScheduled, rivertype.JobStateRetryable:
		default:
			continue
		}
		var args ArgsLogParse
		if json.Unmarshal(job.EncodedArgs, &args) == nil && effectiveParseGeneration(args.ParseGeneration) == state.Generation {
			return true
		}
	}
	return false
}
