import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AdminInfrastructureCosts, type InfrastructureCostReport } from "./AdminInfrastructureCosts";

const services = [
  {
    id: "2792fc4c-66de-485e-8d19-92e3739059a2",
    name: "Postgres",
    totalCostMicros: 118_259_448,
    cpuCostMicros: 6_118_189,
    memoryCostMicros: 87_638_642,
    egressCostMicros: 978,
    volumeCostMicros: 16_842_810,
    backupCostMicros: 7_658_830,
  },
  {
    id: "01333d84-003b-42e3-9910-fc97de32fc5b",
    name: "chronicled",
    totalCostMicros: 25_808_032,
    cpuCostMicros: 1_578_194,
    memoryCostMicros: 5_917_841,
    egressCostMicros: 18_311_998,
    volumeCostMicros: 0,
    backupCostMicros: 0,
  },
  {
    id: "bf5bf39b-5f9f-4afc-a135-1f44dbd52d63",
    name: "authzed/spicedb",
    totalCostMicros: 2_338_335,
    cpuCostMicros: 52_064,
    memoryCostMicros: 2_286_043,
    egressCostMicros: 228,
    volumeCostMicros: 0,
    backupCostMicros: 0,
  },
  {
    id: "71da8486-da28-4405-ac98-8dd91bb41e05",
    name: "monitor-railway",
    totalCostMicros: 1_276_270,
    cpuCostMicros: 26_147,
    memoryCostMicros: 1_210_357,
    egressCostMicros: 39_765,
    volumeCostMicros: 0,
    backupCostMicros: 0,
  },
  {
    id: "other",
    name: "Sleeping utilities",
    totalCostMicros: 1_569,
    cpuCostMicros: 225,
    memoryCostMicros: 1_340,
    egressCostMicros: 4,
    volumeCostMicros: 0,
    backupCostMicros: 0,
  },
];

const users = [
  ["RaidArchivist", true, 71, 1_941_000_000, 2_338_000_000, 262_289, 690_000, 123_000],
  ["MoonlitHealer", true, 48, 1_421_000_000, 1_894_000_000, 262_289, 505_000, 100_000],
  ["ThreatTable", true, 32, 982_000_000, 2_021_000_000, 262_289, 349_000, 107_000],
  ["ChromieTime", true, 27, 740_000_000, 1_512_000_000, 262_289, 263_000, 80_000],
  ["VanillaMetrics", true, 19, 514_000_000, 1_200_000_000, 262_289, 183_000, 63_000],
  ["OldLogs", false, 0, 0, 1_981_000_000, 0, 0, 104_000],
  ["TankNotes", true, 11, 184_000_000, 621_000_000, 262_289, 65_000, 33_000],
  ["FeralSpreadsheet", true, 8, 108_000_000, 418_000_000, 262_289, 38_000, 22_000],
].map(([username, activeUploader, uploadedFiles, monthlyParsedBytes, currentParsedBytes, sharedCostMicros, activityCostMicros, storageCostMicros], index) => ({
  id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
  username: String(username),
  activeUploader: Boolean(activeUploader),
  uploadedFiles: Number(uploadedFiles),
  monthlyParsedBytes: Number(monthlyParsedBytes),
  currentParsedBytes: Number(currentParsedBytes),
  sharedCostMicros: Number(sharedCostMicros),
  activityCostMicros: Number(activityCostMicros),
  storageCostMicros: Number(storageCostMicros),
  totalCostMicros: Number(sharedCostMicros) + Number(activityCostMicros) + Number(storageCostMicros),
}));

const report: InfrastructureCostReport = {
  id: "9482ee37-59b3-495d-b20d-68f342717d61",
  status: "published",
  generatedAt: "2026-11-05T18:00:00Z",
  storageAsOf: "2026-11-05T17:58:42Z",
  period: {
    start: "2026-10-03T23:47:24Z",
    end: "2026-11-03T23:47:24Z",
  },
  scope: {
    provider: "railway",
    projectName: "Chronicle",
    serverType: "legacy",
    coverage: "partial",
  },
  costs: {
    totalCostMicros: 147_683_654,
    previousTotalCostMicros: 133_821_000,
    memoryCostMicros: 97_054_224,
    cpuCostMicros: 7_774_819,
    egressCostMicros: 18_352_971,
    volumeCostMicros: 16_842_810,
    backupCostMicros: 7_658_830,
    sharedCostMicros: 115_407_195,
    activityCostMicros: 7_774_819,
    storageCostMicros: 24_501_640,
    inactiveStorageCostMicros: 2_743_128,
    services,
  },
  usage: {
    registeredUsers: 1_538,
    newUsers: 436,
    activeUploaders: 440,
    uploadedFiles: 3_598,
    parsedInstances: 5_567,
    uploadedRawBytes: 168_612_134_572,
    uploadedStoredBytes: 19_666_315_800,
    monthlyParsedBytes: 21_861_022_091,
    currentParsedBytes: 46_576_311_795,
    inactiveStorageOwners: 159,
  },
  unitEconomics: {
    costPerActiveUploaderMicros: 335_645,
    costPerUploadedLogMicros: 41_046,
    costPerParsedInstanceMicros: 26_528,
    medianCostMicros: 308_000,
    p75CostMicros: 351_300,
    p95CostMicros: 452_900,
    p99CostMicros: 640_700,
    maximumCostMicros: 898_100,
    topOnePercentBasisPoints: 260,
    topFivePercentBasisPoints: 860,
    topTenPercentBasisPoints: 1_520,
  },
  users,
  warnings: [
    {
      code: "PROJECT_COST_DATABASE_SCOPE_MISMATCH",
      message: "Railway cost covers the project while Chronicle usage was collected from the legacy database only.",
    },
    {
      code: "POINT_IN_TIME_STORAGE",
      message: "Storage allocation uses current parsed bytes captured when this report was generated.",
    },
    {
      code: "UPLOAD_APPEND_LIMITATION",
      message: "Creation-time upload metrics may not include all appends to logs created before this billing period.",
    },
  ],
};

const meta = {
  title: "Pages/Admin/Infrastructure costs",
  component: AdminInfrastructureCosts,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => <div className="p-4 sm:p-6 lg:p-8"><Story /></div>,
  ],
  args: {
    report,
    onGenerate: fn(),
    onExport: fn(),
  },
} satisfies Meta<typeof AdminInfrastructureCosts>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first real Chronicle dry run, including project-wide Railway cost and legacy database usage. */
export const PublishedReport: Story = {};

/** A future report where every production database contributes usage to the allocation. */
export const CompleteCoverage: Story = {
  args: {
    report: {
      ...report,
      scope: { ...report.scope, coverage: "complete", serverType: "all production databases" },
      warnings: report.warnings.filter((warning) => warning.code !== "PROJECT_COST_DATABASE_SCOPE_MISMATCH"),
    },
  },
};

/** An unusually efficient period with lower spend and more active uploaders. */
export const ImprovingEconomics: Story = {
  args: {
    report: {
      ...report,
      costs: {
        ...report.costs,
        totalCostMicros: 121_220_000,
        previousTotalCostMicros: 147_683_654,
      },
      usage: {
        ...report.usage,
        activeUploaders: 612,
        uploadedFiles: 5_189,
      },
      unitEconomics: {
        ...report.unitEconomics,
        costPerActiveUploaderMicros: 198_072,
        costPerUploadedLogMicros: 23_360,
        medianCostMicros: 185_000,
        p75CostMicros: 217_000,
        p95CostMicros: 304_000,
      },
    },
  },
};
