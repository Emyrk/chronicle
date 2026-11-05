package infrastructurecosts

import (
	"time"

	"github.com/google/uuid"
)

type CategoryCosts struct {
	MemoryMicrodollars       int64 `json:"memoryMicrodollars"`
	CPUMicrodollars          int64 `json:"cpuMicrodollars"`
	EgressMicrodollars       int64 `json:"egressMicrodollars"`
	VolumeMicrodollars       int64 `json:"volumeMicrodollars"`
	BackupMicrodollars       int64 `json:"backupMicrodollars"`
	UnclassifiedMicrodollars int64 `json:"unclassifiedMicrodollars"`
}

func (c CategoryCosts) Total() int64 {
	return c.MemoryMicrodollars + c.CPUMicrodollars + c.EgressMicrodollars + c.VolumeMicrodollars + c.BackupMicrodollars + c.UnclassifiedMicrodollars
}

type ServiceUsage struct {
	ServiceID             string        `json:"serviceId"`
	ServiceName           string        `json:"serviceName"`
	CPUUsageVCPUMinutes   float64       `json:"cpuUsageVCpuMinutes"`
	MemoryUsageGBMinutes  float64       `json:"memoryUsageGBMinutes"`
	NetworkTXGB           float64       `json:"networkTxGB"`
	DiskUsageGBMinutes    float64       `json:"diskUsageGBMinutes"`
	BackupUsageGBMinutes  float64       `json:"backupUsageGBMinutes"`
	Costs                 CategoryCosts `json:"costs"`
	TotalCostMicrodollars int64         `json:"totalCostMicrodollars"`
}

type ProviderUsage struct {
	WorkspaceID string         `json:"workspaceId"`
	ProjectID   string         `json:"projectId"`
	ProjectName string         `json:"projectName"`
	PeriodStart time.Time      `json:"periodStart"`
	PeriodEnd   time.Time      `json:"periodEnd"`
	Services    []ServiceUsage `json:"services"`
	Costs       CategoryCosts  `json:"costs"`
	Warnings    []string       `json:"warnings,omitempty"`
}

type UserActivity struct {
	UserID              uuid.UUID
	UsernameSnapshot    string
	ActiveUploader      bool
	UploadedFiles       int64
	UploadedLogGroups   int64
	UploadedRawBytes    int64
	UploadedStoredBytes int64
	ParsedInstances     int64
	MonthlyParsedBytes  int64
	CurrentParsedBytes  int64
}

type UserAllocation struct {
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

type CostPools struct {
	SharedMicrodollars          int64 `json:"sharedMicrodollars"`
	ActivityMicrodollars        int64 `json:"activityMicrodollars"`
	StorageMicrodollars         int64 `json:"storageMicrodollars"`
	UnattributedMicrodollars    int64 `json:"unattributedMicrodollars"`
	InactiveStorageMicrodollars int64 `json:"inactiveStorageMicrodollars"`
}

type UsageSummary struct {
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

type Distribution struct {
	Mean   int64 `json:"mean"`
	Median int64 `json:"median"`
	P75    int64 `json:"p75"`
	P95    int64 `json:"p95"`
	P99    int64 `json:"p99"`
	Max    int64 `json:"max"`
}
type Concentration struct {
	Top1  float64 `json:"top1"`
	Top5  float64 `json:"top5"`
	Top10 float64 `json:"top10"`
}
type UnitEconomics struct {
	CostPerLogMicrodollars            int64         `json:"costPerLogMicrodollars"`
	CostPerParsedInstanceMicrodollars int64         `json:"costPerParsedInstanceMicrodollars"`
	ActiveDistribution                Distribution  `json:"activeDistribution"`
	Concentration                     Concentration `json:"concentration"`
}
type Scope struct {
	ProjectName string `json:"projectName"`
	ServerType  string `json:"serverType"`
	Coverage    string `json:"coverage"`
}
type AllocationPolicy struct {
	Currency  string `json:"currency"`
	Precision string `json:"precision"`
	Shared    string `json:"shared"`
	Activity  string `json:"activity"`
	Storage   string `json:"storage"`
	Rounding  string `json:"rounding"`
}
type Report struct {
	ID                            uuid.UUID        `json:"id"`
	PeriodStart                   time.Time        `json:"periodStart"`
	PeriodEnd                     time.Time        `json:"periodEnd"`
	Revision                      int32            `json:"revision"`
	Status                        string           `json:"status"`
	GeneratedAt                   time.Time        `json:"generatedAt"`
	StorageAsOf                   time.Time        `json:"storageAsOf"`
	Scope                         Scope            `json:"scope"`
	Costs                         CategoryCosts    `json:"costs"`
	Pools                         CostPools        `json:"pools"`
	Services                      []ServiceUsage   `json:"services"`
	Usage                         UsageSummary     `json:"usage"`
	UnitEconomics                 UnitEconomics    `json:"unitEconomics"`
	AllocationPolicy              AllocationPolicy `json:"allocationPolicy"`
	Warnings                      []string         `json:"warnings"`
	TotalCostMicrodollars         int64            `json:"totalCostMicrodollars"`
	PreviousTotalCostMicrodollars *int64           `json:"previousTotalCostMicrodollars,omitempty"`
	Provider                      string           `json:"provider"`
	ProviderPayloadSHA256         string           `json:"providerPayloadSHA256"`
}
