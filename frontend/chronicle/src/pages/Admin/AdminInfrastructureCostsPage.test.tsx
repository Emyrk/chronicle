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
    projectName: "Chronicle",
    serverType: "legacy",
    coverage: "partial",
    totalCostMicrodollars: 147_683_654,
    memoryCostMicrodollars: 97_054_224,
    cpuCostMicrodollars: 7_774_819,
    networkCostMicrodollars: 18_352_971,
    diskCostMicrodollars: 16_842_810,
    backupCostMicrodollars: 7_658_830,
    sharedCostMicrodollars: 115_407_195,
    activityCostMicrodollars: 7_774_819,
    storageCostMicrodollars: 24_501_640,
    inactiveStorageCostMicrodollars: 2_743_128,
    services: [{
      serviceId: "postgres",
      serviceName: "Postgres",
      totalCostMicrodollars: 118_259_448,
      cpuCostMicrodollars: 6_118_189,
      memoryCostMicrodollars: 87_638_642,
      networkCostMicrodollars: 978,
      diskCostMicrodollars: 16_842_810,
      backupCostMicrodollars: 7_658_830,
    }],
    usage: {
      registeredUsersAtEnd: 1_538,
      newUsers: 436,
      activeUploaderCount: 440,
      uploadCount: 3_598,
      uploadedRawBytes: 168_612_134_572,
      uploadedStoredBytes: 19_666_315_800,
      parsedInstanceCount: 5_567,
      monthlyParsedEventBytes: 21_861_022_091,
      currentParsedStorageBytes: 46_576_311_795,
      storageOwnerCount: 579,
      inactiveStorageOwnerCount: 159,
    },
    unitEconomics: {
      costPerActiveUploaderMicrodollars: 335_645,
      costPerUploadedLogMicrodollars: 41_046,
      costPerParsedInstanceMicrodollars: 26_528,
      medianCostMicrodollars: 308_000,
      p75CostMicrodollars: 351_300,
      p95CostMicrodollars: 452_900,
      p99CostMicrodollars: 640_700,
      maximumCostMicrodollars: 898_100,
      topOnePercentBasisPoints: 260,
      topFivePercentBasisPoints: 860,
      topTenPercentBasisPoints: 1_520,
    },
    warnings: [{ code: "POINT_IN_TIME_STORAGE", message: "Storage uses a current snapshot." }],
  });
  client.setQueryData([...listKey, reportID, "users", 100, 0], {
    users: [{
      userId: "00000000-0000-0000-0000-000000000001",
      usernameSnapshot: "RaidArchivist",
      activeUploader: true,
      uploadCount: 71,
      monthlyParsedEventBytes: 1_941_000_000,
      currentParsedStorageBytes: 2_338_000_000,
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
  expect(markup).toContain("Partial usage coverage");
  expect(markup).toContain("Postgres");
  client.clear();
});
