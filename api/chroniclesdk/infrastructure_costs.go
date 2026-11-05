package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type InfrastructureCostCategoryCosts struct {
	MemoryMicrodollars       int64 `json:"memoryMicrodollars"`
	CPUMicrodollars          int64 `json:"cpuMicrodollars"`
	EgressMicrodollars       int64 `json:"egressMicrodollars"`
	VolumeMicrodollars       int64 `json:"volumeMicrodollars"`
	BackupMicrodollars       int64 `json:"backupMicrodollars"`
	UnclassifiedMicrodollars int64 `json:"unclassifiedMicrodollars"`
}
type InfrastructureCostPools struct {
	SharedMicrodollars          int64 `json:"sharedMicrodollars"`
	ActivityMicrodollars        int64 `json:"activityMicrodollars"`
	StorageMicrodollars         int64 `json:"storageMicrodollars"`
	UnattributedMicrodollars    int64 `json:"unattributedMicrodollars"`
	InactiveStorageMicrodollars int64 `json:"inactiveStorageMicrodollars"`
}
type InfrastructureCostScope struct {
	ProjectName string `json:"projectName"`
	ServerType  string `json:"serverType"`
	Coverage    string `json:"coverage"`
}
type InfrastructureCostService struct {
	ServiceID             string                          `json:"serviceId"`
	ServiceName           string                          `json:"serviceName"`
	CPUUsageVCpuMinutes   float64                         `json:"cpuUsageVCpuMinutes"`
	MemoryUsageGBMinutes  float64                         `json:"memoryUsageGBMinutes"`
	NetworkTXGB           float64                         `json:"networkTxGB"`
	DiskUsageGBMinutes    float64                         `json:"diskUsageGBMinutes"`
	BackupUsageGBMinutes  float64                         `json:"backupUsageGBMinutes"`
	Costs                 InfrastructureCostCategoryCosts `json:"costs"`
	TotalCostMicrodollars int64                           `json:"totalCostMicrodollars"`
}
type InfrastructureCostUsage struct {
	RegisteredUsersAtEnd  int64 `json:"registeredUsersAtEnd"`
	NewUsers              int64 `json:"newUsers"`
	ActiveUploaders       int64 `json:"activeUploaders"`
	UploadedFiles         int64 `json:"uploadedFiles"`
	UploadCount           int64 `json:"uploadCount"`
	UploadedLogGroups     int64 `json:"uploadedLogGroups"`
	UploadedRawBytes      int64 `json:"uploadedRawBytes"`
	UploadedStoredBytes   int64 `json:"uploadedStoredBytes"`
	ParsedInstances       int64 `json:"parsedInstances"`
	MonthlyParsedBytes    int64 `json:"monthlyParsedBytes"`
	CurrentParsedBytes    int64 `json:"currentParsedBytes"`
	CurrentStorageOwners  int64 `json:"currentStorageOwners"`
	InactiveStorageOwners int64 `json:"inactiveStorageOwners"`
	InactiveStorageBytes  int64 `json:"inactiveStorageBytes"`
}
type InfrastructureCostDistribution struct {
	Mean   int64 `json:"mean"`
	Median int64 `json:"median"`
	P75    int64 `json:"p75"`
	P95    int64 `json:"p95"`
	P99    int64 `json:"p99"`
	Max    int64 `json:"max"`
}
type InfrastructureCostConcentration struct {
	Top1  float64 `json:"top1"`
	Top5  float64 `json:"top5"`
	Top10 float64 `json:"top10"`
}
type InfrastructureCostUnitEconomics struct {
	CostPerLogMicrodollars            int64                           `json:"costPerLogMicrodollars"`
	CostPerParsedInstanceMicrodollars int64                           `json:"costPerParsedInstanceMicrodollars"`
	ActiveDistribution                InfrastructureCostDistribution  `json:"activeDistribution"`
	Concentration                     InfrastructureCostConcentration `json:"concentration"`
}
type InfrastructureCostAllocationPolicy struct {
	Currency  string `json:"currency"`
	Precision string `json:"precision"`
	Shared    string `json:"shared"`
	Activity  string `json:"activity"`
	Storage   string `json:"storage"`
	Rounding  string `json:"rounding"`
}
type InfrastructureCostReport struct {
	ID                            uuid.UUID                          `json:"id"`
	PeriodStart                   time.Time                          `json:"periodStart"`
	PeriodEnd                     time.Time                          `json:"periodEnd"`
	Revision                      int32                              `json:"revision"`
	Status                        string                             `json:"status"`
	GeneratedAt                   time.Time                          `json:"generatedAt"`
	StorageAsOf                   time.Time                          `json:"storageAsOf"`
	Scope                         InfrastructureCostScope            `json:"scope"`
	Costs                         InfrastructureCostCategoryCosts    `json:"costs"`
	Pools                         InfrastructureCostPools            `json:"pools"`
	Services                      []InfrastructureCostService        `json:"services"`
	Usage                         InfrastructureCostUsage            `json:"usage"`
	UnitEconomics                 InfrastructureCostUnitEconomics    `json:"unitEconomics"`
	AllocationPolicy              InfrastructureCostAllocationPolicy `json:"allocationPolicy"`
	Warnings                      []string                           `json:"warnings"`
	TotalCostMicrodollars         int64                              `json:"totalCostMicrodollars"`
	PreviousTotalCostMicrodollars *int64                             `json:"previousTotalCostMicrodollars,omitempty"`
	Provider                      string                             `json:"provider"`
	ProviderPayloadSHA256         string                             `json:"providerPayloadSHA256"`
}
type InfrastructureCostReportListItem struct {
	ID                            uuid.UUID `json:"id"`
	PeriodStart                   time.Time `json:"periodStart"`
	PeriodEnd                     time.Time `json:"periodEnd"`
	Revision                      int32     `json:"revision"`
	Status                        string    `json:"status"`
	GeneratedAt                   time.Time `json:"generatedAt"`
	StorageAsOf                   time.Time `json:"storageAsOf"`
	TotalCostMicrodollars         int64     `json:"totalCostMicrodollars"`
	PreviousTotalCostMicrodollars *int64    `json:"previousTotalCostMicrodollars,omitempty"`
	ActiveUploaderCount           int64     `json:"activeUploaderCount"`
	StorageOwnerCount             int64     `json:"storageOwnerCount"`
	WarningCount                  int64     `json:"warningCount"`
}
type ListInfrastructureCostReportsResponse struct {
	Reports []InfrastructureCostReportListItem `json:"reports"`
	Total   int64                              `json:"total"`
	Limit   int32                              `json:"limit"`
	Offset  int32                              `json:"offset"`
}
type InfrastructureCostReportUser struct {
	UserID                   uuid.UUID `json:"userId"`
	UsernameSnapshot         string    `json:"usernameSnapshot"`
	ActiveUploader           bool      `json:"activeUploader"`
	UploadedFiles            int64     `json:"uploadedFiles"`
	MonthlyParsedBytes       int64     `json:"monthlyParsedBytes"`
	CurrentParsedBytes       int64     `json:"currentParsedBytes"`
	SharedCostMicrodollars   int64     `json:"sharedCostMicrodollars"`
	ActivityCostMicrodollars int64     `json:"activityCostMicrodollars"`
	StorageCostMicrodollars  int64     `json:"storageCostMicrodollars"`
	TotalCostMicrodollars    int64     `json:"totalCostMicrodollars"`
}
type ListInfrastructureCostReportUsersResponse struct {
	Users  []InfrastructureCostReportUser `json:"users"`
	Total  int64                          `json:"total"`
	Limit  int32                          `json:"limit"`
	Offset int32                          `json:"offset"`
}
type GenerateInfrastructureCostReportRequest struct {
	PeriodStart *time.Time `json:"periodStart,omitempty"`
	PeriodEnd   *time.Time `json:"periodEnd,omitempty"`
	Force       bool       `json:"force"`
}
type GenerateInfrastructureCostReportResponse struct {
	JobID       int64     `json:"jobId"`
	PeriodStart time.Time `json:"periodStart"`
	PeriodEnd   time.Time `json:"periodEnd"`
	Force       bool      `json:"force"`
	Duplicate   bool      `json:"duplicate"`
}
