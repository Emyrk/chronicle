import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdminInfrastructureCostsPage } from "./AdminInfrastructureCostsPage";

const listKey = ["admin", "infrastructure-costs"] as const;
const reportID = "9482ee37-59b3-495d-b20d-68f342717d61";

it("renders an empty state when no cost report has been generated", () => {
  const client = new QueryClient();
  client.setQueryData(listKey, { reports: [], limit: 50, offset: 0 });
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={client}><AdminInfrastructureCostsPage /></QueryClientProvider>,
  );
  expect(markup).toContain("No infrastructure reports yet");
  expect(markup).toContain("Generate first report");
  client.clear();
});

it("maps the admin API response into the infrastructure economics report", () => {
  const client = new QueryClient();
  client.setQueryData(listKey, {
    reports: [{
      id: reportID,
      periodStart: "2026-10-03T23:47:24Z",
      periodEnd: "2026-11-03T23:47:24Z",
      revision: 1,
      generatedAt: "2026-11-05T18:00:00Z",
      totalCostMicrodollars: 147_683_654,
    }],
    limit: 50,
    offset: 0,
  });
  client.setQueryData([...listKey, reportID], {
    id: reportID,
    status: "published",
    generatedAt: "2026-11-05T18:00:00Z",
    storageAsOf: "2026-11-05T17:58:42Z",
    periodStart: "2026-10-03T23:47:24Z",
    periodEnd: "2026-11-03T23:47:24Z",
    provider: "railway",
    scope: { projectName: "Chronicle", serverType: "legacy", coverage: "partial" },
    totalCostMicrodollars: 147_683_654,
    costs: {
      memoryMicrodollars: 97_054_224,
      cpuMicrodollars: 7_774_819,
      egressMicrodollars: 18_352_971,
      volumeMicrodollars: 16_842_810,
      backupMicrodollars: 7_658_830,
      unclassifiedMicrodollars: 0,
    },
    pools: {
      sharedMicrodollars: 115_407_195,
      activityMicrodollars: 7_774_819,
      storageMicrodollars: 24_501_640,
      inactiveStorageMicrodollars: 2_743_128,
      unattributedMicrodollars: 0,
    },
    services: [{
      serviceId: "postgres",
      serviceName: "Postgres",
      totalCostMicrodollars: 118_259_448,
      costs: {
        cpuMicrodollars: 6_118_189,
        memoryMicrodollars: 87_638_642,
        egressMicrodollars: 978,
        volumeMicrodollars: 16_842_810,
        backupMicrodollars: 7_658_830,
        unclassifiedMicrodollars: 0,
      },
    }],
    usage: {
      registeredUsersAtEnd: 1_538,
      newUsers: 436,
      activeUploaders: 440,
      uploadedFiles: 3_598,
      uploadCount: 3_598,
      uploadedLogGroups: 3_598,
      uploadedRawBytes: 168_612_134_572,
      uploadedStoredBytes: 19_666_315_800,
      parsedInstances: 5_567,
      monthlyParsedBytes: 21_861_022_091,
      currentParsedBytes: 46_576_311_795,
      currentStorageOwners: 579,
      inactiveStorageOwners: 159,
      inactiveStorageBytes: 5_214_540_901,
    },
    unitEconomics: {
      costPerLogMicrodollars: 41_046,
      costPerParsedInstanceMicrodollars: 26_528,
      activeDistribution: { mean: 329_400, median: 308_000, p75: 351_300, p95: 452_900, p99: 640_700, max: 898_100 },
      concentration: { top1: 0.026, top5: 0.086, top10: 0.152 },
    },
    warnings: ["Storage allocation uses a point-in-time parsed storage snapshot."],
  });
  client.setQueryData([...listKey, reportID, "users", 100, 0], {
    users: [{
      userId: "00000000-0000-0000-0000-000000000001",
      usernameSnapshot: "RaidArchivist",
      activeUploader: true,
      uploadedFiles: 71,
      monthlyParsedBytes: 1_941_000_000,
      currentParsedBytes: 2_338_000_000,
      sharedCostMicrodollars: 262_289,
      activityCostMicrodollars: 490_000,
      storageCostMicrodollars: 123_000,
      totalCostMicrodollars: 875_289,
    }],
    limit: 100,
    offset: 0,
    total: 1,
  });

  const markup = renderToStaticMarkup(
    <QueryClientProvider client={client}><AdminInfrastructureCostsPage /></QueryClientProvider>,
  );
  expect(markup).toContain("Infrastructure economics");
  expect(markup).toContain("$0.336");
  expect(markup).toContain("$147.68");
  expect(markup).toContain("2.6%");
  expect(markup).toContain("Partial usage coverage");
  expect(markup).toContain("Postgres");
  client.clear();
});
