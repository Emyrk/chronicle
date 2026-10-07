import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

const snapshots = [
  {
    canonical: "api/chronicleproto/chronicle.proto",
    snapshot: "frontend/chronicle-panel-sdk/proto/chronicle.proto",
  },
  {
    canonical: "frontend/chronicle/src/api/proto/chronicle_pb.ts",
    snapshot: "frontend/chronicle-panel-sdk/src/v1/protobuf/chronicle_pb.ts",
  },
];

for (const { canonical, snapshot } of snapshots) {
  const [canonicalData, snapshotData] = await Promise.all([
    readFile(new URL(canonical, `file://${repositoryRoot}/`)),
    readFile(new URL(snapshot, `file://${repositoryRoot}/`)),
  ]);

  if (!canonicalData.equals(snapshotData)) {
    console.error(`${snapshot} is out of sync with ${canonical}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error("Run (cd api/chronicleproto && buf generate), then copy chronicle.proto into the SDK proto directory.");
} else {
  console.log(`Protobuf snapshots are in sync for ${packageRoot}`);
}
