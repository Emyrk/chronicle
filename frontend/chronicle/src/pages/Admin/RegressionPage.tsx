import { useState, Fragment, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { TestTube, Plus, Trash2, Camera, GitCompare, AlertTriangle, ChevronDown, ChevronRight, Check, X, Minus } from "lucide-react";
import {
  useRegressionFixtures,
  useRegressionSnapshots,
  useRegressionSnapshot,
  useCreateRegressionFixture,
  useDeleteRegressionFixture,
  useUpdateRegressionFixtureNote,
  useTakeSnapshot,
  useSnapshotAll,
  useDeleteRegressionSnapshot,
} from "@/api/queries";
import type { RegressionSnapshotSummary, RegressionFixture } from "@/api/typesGenerated";

function SimpleDiff({ left, right, leftLabel, rightLabel }: { left: string; right: string; leftLabel?: string; rightLabel?: string }) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const maxLines = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="overflow-auto max-h-[600px] border border-gray-700 rounded">
      {(leftLabel || rightLabel) && (
        <div className="grid grid-cols-2 gap-0 border-b border-gray-700 bg-gray-800/50 text-xs font-semibold text-gray-300 sticky top-0">
          <div className="px-2 py-1 border-r border-gray-700">{leftLabel || "Left"}</div>
          <div className="px-2 py-1">{rightLabel || "Right"}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-0 font-mono text-xs">
        {Array.from({ length: maxLines }, (_, i) => {
          const l = leftLines[i] ?? "";
          const r = rightLines[i] ?? "";
          const differs = l !== r;
          return (
            <Fragment key={i}>
              <div className={`px-2 py-0.5 border-r border-gray-800 ${differs ? "bg-red-900/30" : ""}`}>{l || "\u00A0"}</div>
              <div className={`px-2 py-0.5 ${differs ? "bg-green-900/30" : ""}`}>{r || "\u00A0"}</div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function MatchBadge({ matches }: { matches: boolean | null | undefined }) {
  if (matches === null || matches === undefined) {
    return <Minus className="h-3.5 w-3.5 text-gray-500" title="No previous snapshot to compare" />;
  }
  if (matches) {
    return <Check className="h-3.5 w-3.5 text-green-400" title="Matches previous snapshot" />;
  }
  return <X className="h-3.5 w-3.5 text-red-400" title="Differs from previous snapshot" />;
}

function FixtureCard({
  fixture,
  selectedSnapshots,
  onToggleSnapshot,
  onDeleteSnapshot,
  onTakeSnapshot,
  onDeleteFixture,
  onUpdateNote,
}: {
  fixture: RegressionFixture;
  selectedSnapshots: Map<string, RegressionSnapshotSummary>;
  onToggleSnapshot: (s: RegressionSnapshotSummary) => void;
  onDeleteSnapshot: (id: string) => void;
  onTakeSnapshot: (fixtureId: string) => void;
  onDeleteFixture: (fixtureId: string) => void;
  onUpdateNote: (fixtureId: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const { data: snapshots, isLoading } = useRegressionSnapshots(fixture.id);

  const snapshotCount = snapshots?.length ?? 0;
  // Latest snapshot with a matches_previous value (first in desc order that has it set)
  const latestWithStatus = snapshots?.find((s) => s.matches_previous !== null && s.matches_previous !== undefined);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Fixture Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800/30">
        <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-white">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Latest status badge */}
        {latestWithStatus ? (
          <MatchBadge matches={latestWithStatus.matches_previous} />
        ) : (
          <Minus className="h-3.5 w-3.5 text-gray-600" title="No comparison data yet" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editingNote !== null ? (
              <form
                className="flex items-center gap-1 flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  onUpdateNote(fixture.id, editingNote);
                  setEditingNote(null);
                }}
              >
                <input
                  className="px-2 py-0.5 rounded bg-gray-800 border border-gray-600 text-sm flex-1"
                  value={editingNote}
                  onChange={(e) => setEditingNote(e.target.value)}
                  autoFocus
                />
                <Button size="sm" type="submit">Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingNote(null)}>Cancel</Button>
              </form>
            ) : (
              <button
                className="text-sm font-medium hover:text-blue-400 text-left truncate"
                onClick={() => setEditingNote(fixture.note)}
                title="Click to edit note"
              >
                {fixture.note || <span className="text-gray-500 italic">Click to add a description...</span>}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            <a
              href={`/logs/${fixture.log_group_id}`}
              className="text-blue-400/70 hover:text-blue-400 hover:underline font-mono"
            >
              Log: {fixture.log_group_id.slice(0, 12)}...
            </a>
            <span>Pinned {new Date(fixture.created_at).toLocaleDateString()}</span>
            <span>{snapshotCount} snapshot{snapshotCount !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <Button size="sm" variant="ghost" onClick={() => onTakeSnapshot(fixture.id)} title="Take Snapshot">
          <Camera className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { if (confirm("Delete this fixture and all its snapshots?")) onDeleteFixture(fixture.id); }}
          title="Delete fixture"
        >
          <Trash2 className="h-4 w-4 text-red-400" />
        </Button>
      </div>

      {/* Snapshots List */}
      {expanded && (
        <div className="border-t border-gray-700">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-400">Loading snapshots...</div>
          ) : !snapshots?.length ? (
            <div className="px-4 py-3 text-sm text-gray-500 italic">
              No snapshots yet. Click <Camera className="h-3 w-3 inline" /> to take one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="px-4 py-1.5 text-left w-8"></th>
                  <th className="px-2 py-1.5 text-center w-8" title="Matches previous">Status</th>
                  <th className="px-2 py-1.5 text-left">Version</th>
                  <th className="px-2 py-1.5 text-left">Build Time</th>
                  <th className="px-2 py-1.5 text-left">Snapshot Taken</th>
                  <th className="px-2 py-1.5 text-right w-8"></th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-800/40 border-b border-gray-800/50 last:border-0">
                    <td className="px-4 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedSnapshots.has(s.id)}
                        onChange={() => onToggleSnapshot(s)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <MatchBadge matches={s.matches_previous} />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {s.version === "unknown" ? (
                        <span className="text-gray-500">{s.version}</span>
                      ) : (
                        <span className="text-blue-300">{s.version.slice(0, 10)}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-400">
                      {s.build_time && s.build_time !== "unknown" ? s.build_time : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-400">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        className="text-red-400/60 hover:text-red-400 p-0.5"
                        title="Delete snapshot"
                        onClick={() => { if (confirm("Delete this snapshot?")) onDeleteSnapshot(s.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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

  const deleteSnapshot = useDeleteRegressionSnapshot();

  // Toast on mutation errors
  useEffect(() => {
    const errors = [
      { mutation: createFixture, label: "Create fixture" },
      { mutation: deleteFixture, label: "Delete fixture" },
      { mutation: updateNote, label: "Update note" },
      { mutation: takeSnapshot, label: "Take snapshot" },
      { mutation: snapshotAll, label: "Snapshot all" },

      { mutation: deleteSnapshot, label: "Delete snapshot" },
    ];
    for (const { mutation, label } of errors) {
      if (mutation.error) {
        toast.error(`${label}: ${mutation.error.message}`);
      }
    }
  }, [
    createFixture.error, deleteFixture.error, updateNote.error,
    takeSnapshot.error, snapshotAll.error,
    deleteSnapshot.error,
  ]);

  const [newLogGroupId, setNewLogGroupId] = useState("");
  const [newNote, setNewNote] = useState("");
  const [selectedSnapshots, setSelectedSnapshots] = useState<Map<string, RegressionSnapshotSummary>>(new Map());


  // Diff state
  const [diffLeft, setDiffLeft] = useState<string | null>(null);
  const [diffRight, setDiffRight] = useState<string | null>(null);
  const [diffLeftLabel, setDiffLeftLabel] = useState<string>("");
  const [diffRightLabel, setDiffRightLabel] = useState<string>("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [fetchingRemote, setFetchingRemote] = useState(false);

  const selectedArray = Array.from(selectedSnapshots.values());

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

  const snapshotLabel = (s: RegressionSnapshotSummary) => {
    const ver = s.version === "unknown" ? "dev" : s.version.slice(0, 8);
    const bt = s.build_time && s.build_time !== "unknown" ? ` (${s.build_time})` : "";
    return `${ver}${bt}`;
  };

  const handleCompare = () => {
    if (selectedArray.length === 2) {
      setCompareIds([selectedArray[0].id, selectedArray[1].id]);
      setDiffLeft(null);
      setDiffRight(null);
      setDiffLeftLabel(snapshotLabel(selectedArray[0]));
      setDiffRightLabel(snapshotLabel(selectedArray[1]));
    }
  };

  const handleFetchRemote = async () => {
    if (!remoteUrl || selectedArray.length !== 1) return;
    setFetchingRemote(true);
    try {
      const response = await fetch(remoteUrl);
      const data = await response.json();
      setDiffRight(JSON.stringify(data.snapshot ?? data, null, 2));
      setDiffRightLabel("Remote");
      const localResp = await fetch(`/api/v1/regression/snapshots/${selectedArray[0].id}`);
      const localData = await localResp.json();
      setDiffLeft(JSON.stringify(localData.snapshot, null, 2));
      setDiffLeftLabel(snapshotLabel(selectedArray[0]));
      setCompareIds(null);
    } catch {
      alert("Failed to fetch remote snapshot");
    } finally {
      setFetchingRemote(false);
    }
  };

  // Update diff display when both snapshots load
  if (compareIds && snap1.data && snap2.data && !diffLeft && !diffRight) {
    const l = JSON.stringify(snap1.data.snapshot, null, 2);
    const r = JSON.stringify(snap2.data.snapshot, null, 2);
    setDiffLeft(l);
    setDiffRight(r);
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <TestTube className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Regression Testing</h1>
      </div>
      <p className="text-sm text-gray-400">
        Pin raid logs, take parse snapshots across versions, and compare results to detect regressions.
      </p>

      {/* Fixtures Section */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pinned Fixtures</h2>
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
        <div className="flex items-end gap-2 p-3 rounded bg-gray-800/30 border border-gray-700/50">
          <div className="flex-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Log Group ID</label>
            <input
              className="w-full mt-1 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono"
              value={newLogGroupId}
              onChange={(e) => setNewLogGroupId(e.target.value)}
              placeholder="paste log group UUID..."
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Description</label>
            <input
              className="w-full mt-1 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. MC full clear with 40-man raid"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!newLogGroupId) return;
              createFixture.mutate(
                { log_group_id: newLogGroupId, note: newNote },
                { onSuccess: () => { setNewLogGroupId(""); setNewNote(""); } },
              );
            }}
            disabled={createFixture.isPending || !newLogGroupId}
          >
            <Plus className="h-4 w-4 mr-1" />
            Pin
          </Button>
        </div>

        {/* Fixtures List */}
        {fixturesLoading ? (
          <div className="text-gray-400 text-sm">Loading fixtures...</div>
        ) : !fixtures?.length ? (
          <div className="text-gray-400 text-sm flex items-center gap-2 py-4 justify-center">
            <AlertTriangle className="h-4 w-4" /> No fixtures pinned yet. Add a log group above.
          </div>
        ) : (
          <div className="space-y-2">
            {fixtures.map((f) => (
              <FixtureCard
                key={f.id}
                fixture={f}
                selectedSnapshots={selectedSnapshots}
                onToggleSnapshot={handleToggleSnapshot}
                onDeleteSnapshot={(id) => deleteSnapshot.mutate(id)}
                onTakeSnapshot={(id) => takeSnapshot.mutate(id)}
                onDeleteFixture={(id) => deleteFixture.mutate(id)}
                onUpdateNote={(id, note) => updateNote.mutate({ fixtureId: id, note })}
              />
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

        {/* Selection info */}
        <div className="text-sm text-gray-400">
          {selectedArray.length === 0 && "Select snapshots from fixtures above to compare (check two boxes)."}
          {selectedArray.length === 1 && (
            <>
              Selected: <span className="text-blue-300 font-mono">{snapshotLabel(selectedArray[0])}</span>
              {" — select one more, or use a remote URL below."}
            </>
          )}
          {selectedArray.length === 2 && (
            <>
              Comparing: <span className="text-blue-300 font-mono">{snapshotLabel(selectedArray[0])}</span>
              {" vs "}
              <span className="text-blue-300 font-mono">{snapshotLabel(selectedArray[1])}</span>
            </>
          )}
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
              <div className="flex-1 min-w-64">
                <label className="text-xs text-gray-400 uppercase tracking-wide">Remote URL</label>
                <input
                  className="w-full mt-1 px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm font-mono"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="http://localhost:3000/api/v1/regression/snapshots/..."
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

        {diffLeft && diffRight && (
          <div>
            {diffLeft === diffRight ? (
              <div className="text-green-400 text-sm font-medium py-4 text-center">
                ✓ Snapshots are identical — no regressions detected.
              </div>
            ) : (
              <SimpleDiff left={diffLeft} right={diffRight} leftLabel={diffLeftLabel} rightLabel={diffRightLabel} />
            )}
          </div>
        )}
      </Card>


    </div>
  );
}
