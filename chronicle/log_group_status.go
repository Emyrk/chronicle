package chronicle

import (
	"encoding/json"

	"github.com/riverqueue/river/rivertype"
)

// logGroupStatusJob preserves active/error status. A completed native compute
// job (or duplicate finalizer) without publication output must not hide the
// latest completed publication from the same generation. jobs must retain the
// newest-first order returned by ListLogGroupJobs.
func logGroupStatusJob(jobs []*rivertype.JobRow) *rivertype.JobRow {
	if len(jobs) == 0 {
		return nil
	}
	latest := jobs[0]
	if latest.State != rivertype.JobStateCompleted || (latest.Kind != KindNativeLogParse && latest.Kind != KindFinalizeLogParse) || hasPublicationOutput(latest) {
		return latest
	}
	var latestArgs ArgsLogParse
	if json.Unmarshal(latest.EncodedArgs, &latestArgs) != nil || latestArgs.ParseGeneration <= 0 {
		return latest
	}
	for _, candidate := range jobs[1:] {
		if candidate.Kind != KindFinalizeLogParse || candidate.State != rivertype.JobStateCompleted || !hasPublicationOutput(candidate) {
			continue
		}
		var args ArgsLogParse
		if json.Unmarshal(candidate.EncodedArgs, &args) != nil {
			continue
		}
		if args.ParseGeneration == latestArgs.ParseGeneration {
			return candidate
		}
	}
	return latest
}

func hasPublicationOutput(job *rivertype.JobRow) bool {
	var output struct {
		Instances json.RawMessage `json:"instances"`
	}
	if json.Unmarshal(job.Output(), &output) != nil {
		return false
	}
	return len(output.Instances) > 0 && string(output.Instances) != "null"
}
