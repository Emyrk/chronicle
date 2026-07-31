package overviewmetrics

// CurrentVersion is the only instance overview metrics version accepted by
// read paths. Reparse or migrate older rows before incrementing this value.
const CurrentVersion int32 = 1
