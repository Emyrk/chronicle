package regexs

import "regexp"

var (
	YouFailToCast = regexp.MustCompile(`.*You fail to cast.*\n`)
)
