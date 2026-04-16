import { useState, Fragment } from "react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { TestTube, Plus, Trash2, Camera, RefreshCw, GitCompare, AlertTriangle } from "lucide-react";
import {
  useRegressionFixtures,
  useRegressionSnapshots,
  useRegressionSnapshot,
  useCreateRegressionFixture,
  useDeleteRegressionFixture,
  useUpdateRegressionFixtureNote,
  useTakeSnapshot,
  useSnapshotAll,
  useRequeueVersion,
} from "@/api/queries";
import type { RegressionSnapshotSummary } from "@/api/typesGenerated";

function SimpleDiff({ left, right }: { left: string; right: string }) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const maxLines = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="grid grid-cols-2 gap-2 font-mono text-xs overflow-auto max-h-[600px]">
      {Array.from({ length: maxLines }, (_, i) => {
        const l = leftLines[i] ?? "";
        const r = rightLines[i] ?? "";
        const differs = l !== r;
        return (
          <Fragment key={i}>
            <div className={differs ? "bg-red-900/30 px-1" : "px-1"}>{l}</div>
            <div className={differs ? "bg-green-900/30 px-1" : "px-1"}>{r}</div>
          </Fragment>
        );
      })}
    </div>
  );
}

function FixtureSnapshots({
  fixtureId,
  selectedSnapshots,
  onToggleSnapshot,
}: {
  fixtureId: string;
  selectedSnapshots: Map<string, RegressionSnapshotSummary>;
  onToggleSnapshot: (s: RegressionSnapshotSummary) => void;
}) {
  const { data: snapshots, isLoading } = useRegressionSnapshots(fixtureId);

  if (isLoading) return <div className="text-sm text-gray-400 py-2">Loading snapshots...</div>;
  if (!snapshots?.length) return <div className="text-sm text-gray-400 py-2">No snapshots yet.</div>;

  return (
    <div className="pl-4 border-l border-gray-700 ml-2">
      {snapshots.map((s) => (
        <label key={s.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer hover:bg-gray-800/50 px-2 rounded">
          <input
            type="checkbox"
            checked={selectedSnapshots.has(s.id)}
            onChange={() => onToggleSnapshot(s)}
          />
          <span className="font-mono">{s.version}</span>
          <span className="text-gray-500">{new Date(s.created_at).toLocaleString()}</span>
        </label>
      ))}
    </div>
  );
}

export function RegressionPage() {
  const { data: fixtures, isLoading: fixturesLoading } = useRegressionFixtures();
  const createFixture = useCreateRegressionFixture();
  const deleteFixture = useDeleteRegressionFixture();
  const updateNote = useUpdateRegressionFixtureNote();
  const takeSnapshot = useTakeSnapshot();
  const snapshotAll = useSnapshotAll();
  const requeueVersion = useRequeueVersion();

  const [newLogGroupId, setNewLogGroupId] = useState("");
  const [newNote, setNewNote] = useState("");
  const [expandedFixture, setExpandedFixture] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<{ id: string; note: string } | null>(null);
  const [selectedSnapshots, setSelectedSnapshots] = useState<Map<string, RegressionSnapshotSummary>>(new Map());
  const [requeueVersionInput, setRequeueVersionInput] = useState("");
  const [requeueResult, setRequeueResult] = useState<number | null>(null);

  // Diff state
  const [diffLeft, setDiffLeft] = useState<string | null>(null);
  const [diffRight, setDiffRight] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [fetchingRemote, setFetchingRemote] = useState(false);

  const selectedArray = Array.from(selectedSnapshots.values());

  // For fetching full snapshots for diff
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const snap1 = useRegressionSnapshot(compareIds?.[0] ?? "");
  const snap2 = useRegressionSnapshot(compareIds?.[1] ?? "");

  const handleToggleSnapshot = (s: RegressionSnapshotSummary) => {
    setSelectedSnapshots((prev) => {
      const next = new Map(prev);
      if (next.has(s.id)) {
        next.delete(s.id);
      } else {
        next.set(s.id, s);
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (selectedArray.length === 2) {
      setCompareIds([selectedArray[0].id, selectedArray[1].id]);
      setDiffLeft(null);
      setDiffRight(null);
    }
  };

  const handleFetchRemote = async () => {
    if (!remoteUrl || selectedArray.length !== 1) return;
    setFetchingRemote(true);
    try {
      const response = await fetch(remoteUrl);
      const data = await response.json();
      setDiffRight(JSON.stringify(data.snapshot ?? data, null, 2));
      // Fetch the local one
      const localResp = await fetch(`/api/v1/regression/snapshots/${selectedArray[0].id}`);
      const localData = await localResp.json();
      setDiffLeft(JSON.stringify(localData.snapshot, null, 2));
      setCompareIds(null);
    } catch {
      alert("Failed to fetch remote snapshot");
    } finally {
      setFetchingRemote(false);
    }
  };

  // Update diff display when both snapshots load
  const showCompareResult =
    compareIds && snap1.data && snap2.data && !diffLeft && !diffRight;
  if (showCompareResult) {
    // Side-effect in render is intentional for simplicity — triggers once
    const l = JSON.stringify(snap1.data.snapshot, null, 2);
    const r = JSON.stringify(snap2.data.snapshot, null, 2);
    setDiffLeft(l);
    setDiffRight(r);
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <TestTube className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Regression Testing</h1>
      </div>

      {/* Fixtures Section */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fixtures</h2>
          <Button
            size="sm"
            onClick={() => snapshotAll.mutate()}
            disabled={snapshotAll.isPending}
          >
            <Camera className="h-4 w-4 mr-1" />
            {snapshotAll.isPending ? "Snapshotting..." : "Snapshot All"}
          </Button>
        </div>

        {/* Add Fixture Form */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-sm text-gray-400">Log Group ID</label>
            <input
              className="w-full mt-1 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
              value={newLogGroupId}
              onChange={(e) => setNewLogGroupId(e.target.value)}
              placeholder="Log group ID..."
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-gray-400">Note</label>
            <input
              className="w-full mt-1 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Optional note..."
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!newLogGroupId) return;
              createFixture.mutate(
                { log_group_id: newLogGroupId, note: newNote },
                {
                  onSuccess: () => {
                    setNewLogGroupId("");
                    setNewNote("");
                  },
                },
              );
            }}
            disabled={createFixture.isPending || !newLogGroupId}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Fixtures Table */}
        {fixturesLoading ? (
          <div className="text-gray-400 text-sm">Loading fixtures...</div>
        ) : !fixtures?.length ? (
          <div className="text-gray-400 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> No fixtures yet.
          </div>
        ) : (
          <div className="space-y-1">
            {fixtures.map((f) => (
              <div key={f.id} className="border border-gray-700 rounded">
                <div className="flex items-center gap-3 px-3 py-2 text-sm">
                  <button
                    className="text-left flex-1 hover:underline font-mono text-xs truncate"
                    onClick={() => setExpandedFixture(expandedFixture === f.id ? null : f.id)}
                    title={f.id}
                  >
                    {f.id.slice(0, 8)}...
                  </button>
                  <a
                    href={`/logs/${f.log_group_id}`}
                    className="text-blue-400 hover:underline font-mono text-xs"
                    title={f.log_group_id}
                  >
                    {f.log_group_id.slice(0, 8)}...
                  </a>
                  {editingNote?.id === f.id ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        updateNote.mutate(
                          { fixtureId: f.id, note: editingNote.note },
                          { onSuccess: () => setEditingNote(null) },
                        );
                      }}
                    >
                      <input
                        className="px-2 py-0.5 rounded bg-gray-800 border border-gray-600 text-xs w-40"
                        value={editingNote.note}
                        onChange={(e) => setEditingNote({ ...editingNote, note: e.target.value })}
                        autoFocus
                      />
                      <Button size="sm" type="submit" disabled={updateNote.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingNote(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <button
                      className="text-gray-300 hover:text-white text-xs truncate max-w-48"
                      onClick={() => setEditingNote({ id: f.id, note: f.note })}
                      title="Click to edit note"
                    >
                      {f.note || <span className="text-gray-500 italic">no note</span>}
                    </button>
                  )}
                  <span className="text-gray-500 text-xs">{new Date(f.created_at).toLocaleDateString()}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => takeSnapshot.mutate(f.id)}
                    disabled={takeSnapshot.isPending}
                    title="Take Snapshot"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Delete this fixture?")) deleteFixture.mutate(f.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
                {expandedFixture === f.id && (
                  <div className="px-3 pb-3">
                    <FixtureSnapshots
                      fixtureId={f.id}
                      selectedSnapshots={selectedSnapshots}
                      onToggleSnapshot={handleToggleSnapshot}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Diff Section */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <GitCompare className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Compare Snapshots</h2>
        </div>

        <div className="text-sm text-gray-400">
          {selectedArray.length === 0 && "Select snapshots from fixtures above to compare."}
          {selectedArray.length === 1 && "Select one more snapshot, or use a remote URL to compare."}
          {selectedArray.length === 2 && "Two snapshots selected. Click Compare."}
          {selectedArray.length > 2 && (
            <span className="text-yellow-400">Select exactly 2 snapshots to compare.</span>
          )}
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          {selectedArray.length === 2 && (
            <Button size="sm" onClick={handleCompare} disabled={snap1.isLoading || snap2.isLoading}>
              <GitCompare className="h-4 w-4 mr-1" />
              Compare
            </Button>
          )}

          {selectedArray.length >= 1 && (
            <>
              <div>
                <label className="text-sm text-gray-400">Remote URL</label>
                <input
                  className="w-full mt-1 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="https://prod.example.com/api/v1/regression/snapshots/..."
                />
              </div>
              <Button
                size="sm"
                onClick={handleFetchRemote}
                disabled={fetchingRemote || !remoteUrl || selectedArray.length !== 1}
              >
                {fetchingRemote ? "Fetching..." : "Fetch & Compare"}
              </Button>
            </>
          )}

          {(diffLeft || diffRight) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDiffLeft(null);
                setDiffRight(null);
                setCompareIds(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {diffLeft && diffRight && <SimpleDiff left={diffLeft} right={diffRight} />}
      </Card>

      {/* Requeue Section */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Requeue by Version</h2>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-sm text-gray-400">Version</label>
            <input
              className="w-full mt-1 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
              value={requeueVersionInput}
              onChange={(e) => setRequeueVersionInput(e.target.value)}
              placeholder="v1.2.3"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!requeueVersionInput) return;
              requeueVersion.mutate(
                { version: requeueVersionInput },
                { onSuccess: (data) => setRequeueResult(data.requeued_count) },
              );
            }}
            disabled={requeueVersion.isPending || !requeueVersionInput}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {requeueVersion.isPending ? "Requeuing..." : "Requeue"}
          </Button>
        </div>
        {requeueResult !== null && (
          <div className="text-sm text-green-400">Requeued {requeueResult} fixture(s).</div>
        )}
      </Card>
    </div>
  );
}
