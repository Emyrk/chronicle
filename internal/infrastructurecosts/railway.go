package infrastructurecosts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"time"
)

const (
	defaultRailwayEndpoint = "https://backboard.railway.app/graphql/v2"
	minutesPerMonth        = 43200.0
	// Verified against railwayapp/cli src/commands/usage.rs; keep the fixture test in sync.
	projectUsageQuery          = `query ProjectUsage($workspaceId:String!,$measurements:[MetricMeasurement!]!,$startDate:DateTime!,$endDate:DateTime!){ usage(workspaceId:$workspaceId,measurements:$measurements,groupBy:[PROJECT_ID,SERVICE_ID],startDate:$startDate,endDate:$endDate,includeDeleted:true){measurement value tags{projectId serviceId}} projects(first:5000,includeDeleted:true,workspaceId:$workspaceId){edges{node{id name deletedAt services{edges{node{id name deletedAt}}}}}} }`
	workspaceUsageContextQuery = `query WorkspaceUsageContext($workspaceId:String!){workspace(workspaceId:$workspaceId){id name customer{id currentUsage billingPeriod{start end}}}}`
)

var railwayMeasurements = []string{"MEMORY_USAGE_GB", "CPU_USAGE", "NETWORK_TX_GB", "DISK_USAGE_GB", "BACKUP_USAGE_GB"}

type RailwayClient struct {
	HTTPClient                              *http.Client
	Endpoint, Token, WorkspaceID, ProjectID string
}

type graphqlRequest struct {
	Query     string `json:"query"`
	Variables any    `json:"variables"`
}
type graphqlResponse[T any] struct {
	Data   T `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func (c *RailwayClient) post(ctx context.Context, query string, variables any, dst any) ([]byte, error) {
	body, err := json.Marshal(graphqlRequest{query, variables})
	if err != nil {
		return nil, err
	}
	endpoint := c.Endpoint
	if endpoint == "" {
		endpoint = defaultRailwayEndpoint
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	client := c.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("railway graphql: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("railway graphql status %d: %s", resp.StatusCode, string(raw))
	}
	if err := json.Unmarshal(raw, dst); err != nil {
		return nil, fmt.Errorf("decode railway graphql: %w", err)
	}
	return raw, nil
}

func shiftMonthClamped(t time.Time, delta int) time.Time {
	first := time.Date(t.Year(), t.Month()+time.Month(delta), 1, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
	lastDay := time.Date(first.Year(), first.Month()+1, 0, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location()).Day()
	day := t.Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(first.Year(), first.Month(), day, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
}

func (c *RailwayClient) PreviousPeriod(ctx context.Context) (time.Time, time.Time, error) {
	var response graphqlResponse[struct {
		Workspace struct {
			Customer struct {
				BillingPeriod struct{ Start, End time.Time } `json:"billingPeriod"`
			} `json:"customer"`
		} `json:"workspace"`
	}]
	_, err := c.post(ctx, workspaceUsageContextQuery, map[string]any{"workspaceId": c.WorkspaceID}, &response)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if len(response.Errors) > 0 {
		return time.Time{}, time.Time{}, fmt.Errorf("railway graphql: %s", response.Errors[0].Message)
	}
	start, end := response.Data.Workspace.Customer.BillingPeriod.Start, response.Data.Workspace.Customer.BillingPeriod.End
	if start.IsZero() || end.IsZero() || !start.Before(end) {
		return time.Time{}, time.Time{}, fmt.Errorf("railway returned invalid billing period")
	}
	return shiftMonthClamped(start, -1), shiftMonthClamped(end, -1), nil
}

type railwayUsageResponse struct {
	Usage []struct {
		Measurement string  `json:"measurement"`
		Value       float64 `json:"value"`
		Tags        struct {
			ProjectID string `json:"projectId"`
			ServiceID string `json:"serviceId"`
		} `json:"tags"`
	} `json:"usage"`
	Projects struct {
		Edges []struct {
			Node struct {
				ID, Name string
				Services struct {
					Edges []struct {
						Node struct{ ID, Name string } `json:"node"`
					} `json:"edges"`
				} `json:"services"`
			} `json:"node"`
		} `json:"edges"`
	} `json:"projects"`
}

func microdollars(value, dollarsPerUnit float64) int64 {
	return int64(math.Round(value * dollarsPerUnit * 1_000_000))
}

func (c *RailwayClient) Fetch(ctx context.Context, start, end time.Time) (ProviderUsage, []byte, error) {
	vars := map[string]any{"workspaceId": c.WorkspaceID, "measurements": railwayMeasurements, "startDate": start.Format(time.RFC3339Nano), "endDate": end.Format(time.RFC3339Nano)}
	var response graphqlResponse[railwayUsageResponse]
	raw, err := c.post(ctx, projectUsageQuery, vars, &response)
	if err != nil {
		return ProviderUsage{}, nil, err
	}
	if len(response.Errors) > 0 {
		return ProviderUsage{}, nil, fmt.Errorf("railway graphql: %s", response.Errors[0].Message)
	}
	projectName := c.ProjectID
	serviceNames := map[string]string{}
	for _, edge := range response.Data.Projects.Edges {
		if edge.Node.ID == c.ProjectID {
			projectName = edge.Node.Name
			for _, se := range edge.Node.Services.Edges {
				serviceNames[se.Node.ID] = se.Node.Name
			}
		}
	}
	byID := map[string]*ServiceUsage{}
	for _, row := range response.Data.Usage {
		if row.Tags.ProjectID != c.ProjectID {
			continue
		}
		id := row.Tags.ServiceID
		if id == "" {
			id = "unattributed"
		}
		svc := byID[id]
		if svc == nil {
			name := serviceNames[id]
			if name == "" {
				name = id
			}
			svc = &ServiceUsage{ServiceID: id, ServiceName: name}
			byID[id] = svc
		}
		switch row.Measurement {
		case "MEMORY_USAGE_GB":
			svc.MemoryUsageGBMinutes += row.Value
			svc.Costs.MemoryMicrodollars += microdollars(row.Value, 10/minutesPerMonth)
		case "CPU_USAGE":
			svc.CPUUsageVCPUMinutes += row.Value
			svc.Costs.CPUMicrodollars += microdollars(row.Value, 20/minutesPerMonth)
		case "NETWORK_TX_GB":
			svc.NetworkTXGB += row.Value
			svc.Costs.EgressMicrodollars += microdollars(row.Value, .05)
		case "DISK_USAGE_GB":
			svc.DiskUsageGBMinutes += row.Value
			svc.Costs.VolumeMicrodollars += microdollars(row.Value, .15/minutesPerMonth)
		case "BACKUP_USAGE_GB":
			svc.BackupUsageGBMinutes += row.Value
			svc.Costs.BackupMicrodollars += microdollars(row.Value, .15/minutesPerMonth)
		default:
			svc.Costs.UnclassifiedMicrodollars += 0
		}
	}
	usage := ProviderUsage{WorkspaceID: c.WorkspaceID, ProjectID: c.ProjectID, ProjectName: projectName, PeriodStart: start, PeriodEnd: end}
	ids := make([]string, 0, len(byID))
	for id := range byID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		svc := *byID[id]
		svc.TotalCostMicrodollars = svc.Costs.Total()
		usage.Services = append(usage.Services, svc)
		usage.Costs.MemoryMicrodollars += svc.Costs.MemoryMicrodollars
		usage.Costs.CPUMicrodollars += svc.Costs.CPUMicrodollars
		usage.Costs.EgressMicrodollars += svc.Costs.EgressMicrodollars
		usage.Costs.VolumeMicrodollars += svc.Costs.VolumeMicrodollars
		usage.Costs.BackupMicrodollars += svc.Costs.BackupMicrodollars
		usage.Costs.UnclassifiedMicrodollars += svc.Costs.UnclassifiedMicrodollars
	}
	if len(usage.Services) == 0 {
		usage.Warnings = append(usage.Warnings, "Railway returned no usage rows for the configured project and period.")
	}
	return usage, raw, nil
}
