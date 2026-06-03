import { useCallback, useRef, useState } from "react";
import { FileText, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { DatasetSelect } from "./DatasetSelect";
import { DEFAULT_DATASET_ID } from "@/api/queries";

interface FieldDiff {
  field: string;
  old: unknown;
  new: unknown;
  unreliable?: boolean;
}

interface EntryDiff {
  entry: number;
  name: string;
  status: "new" | "changed" | "unchanged";
  fields?: FieldDiff[];
}

interface UploadResult {
  signature: string;
  version: number;
  record_count: number;
  mode: string;
  new_items: number;
  changed: number;
  unchanged: number;
  diffs: EntryDiff[] | null;
}

interface WDBUploadProps {
  title: string;
  description: string;
  /** e.g. "itemcache.wdb" */
  fileHint: string;
  /** Whether to show the "hide unreliable" checkbox (item cache has unreliable spell fields) */
  showUnreliableFilter?: boolean;
  /** Optional content rendered inside the Card before the file drop zone */
  cardHeader?: React.ReactNode;
}

export function WDBUpload({ title, description, fileHint, showUnreliableFilter, cardHeader }: WDBUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"compare" | "upsert" | "insert">("compare");
  const [datasetID, setDatasetID] = useState<string>(DEFAULT_DATASET_ID);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hideUnreliable, setHideUnreliable] = useState(true);
  const [hideUnchanged, setHideUnchanged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectFile = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  }, []);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0] ?? null);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files?.[0] ?? null;
      if (dropped) {
        selectFile(dropped);
      }
    },
    [selectFile],
  );

  const onUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("wdb_file", file);

      const response = await fetch(`/api/v1/game-data/wdb/upload?mode=${mode}&dataset_id=${datasetID}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Upload failed (${response.status})`);
      }

      const data: UploadResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <Card className="p-6 max-w-lg">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">WDB File</h3>
          </div>
          <DatasetSelect value={datasetID} onChange={setDatasetID} />
          {cardHeader}
          <p className="text-sm text-muted-foreground">
            Select your <code>{fileHint}</code> file, typically found in your
            WoW client's <code>Cache/WDB/enUS/</code> directory.
          </p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "hover:border-primary"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".wdb"
              onChange={onFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="space-y-1">
                <FileText className="h-8 w-8 mx-auto text-primary" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <UploadIcon className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to select file
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="compare"
                checked={mode === "compare"}
                onChange={() => setMode("compare")}
              />
              Compare only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="insert"
                checked={mode === "insert"}
                onChange={() => setMode("insert")}
              />
              Insert missing only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="upsert"
                checked={mode === "upsert"}
                onChange={() => setMode("upsert")}
              />
              Compare & Upsert
            </label>
          </div>

          <Button
            onClick={onUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            {uploading
              ? "Processing..."
              : mode === "upsert"
                ? "Upload & Upsert"
                : mode === "insert"
                  ? "Upload & Insert Missing"
                  : "Compare"}
          </Button>
        </div>
      </Card>

      {error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Upload Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-4 max-w-2xl">
          <Alert>
            <AlertTitle>
              {result.mode === "upsert"
                ? "Upsert Complete"
                : result.mode === "insert"
                  ? "Insert Complete"
                  : "Compare Complete"}
            </AlertTitle>
            <AlertDescription>
              Parsed {result.record_count} records from {result.signature} cache
              (build {result.version}).
              <span className="block mt-1">
                <strong>{result.new_items}</strong> new,{" "}
                <strong>{result.changed}</strong> changed,{" "}
                <strong>{result.unchanged}</strong> unchanged
              </span>
            </AlertDescription>
          </Alert>

          {result.diffs && result.diffs.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-4">
                {showUnreliableFilter && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hideUnreliable}
                      onChange={(e) => setHideUnreliable(e.target.checked)}
                      className="rounded"
                    />
                    Hide unreliable field diffs
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hideUnchanged}
                    onChange={(e) => setHideUnchanged(e.target.checked)}
                    className="rounded"
                  />
                  Hide unchanged
                </label>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium">Entry</th>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-left px-3 py-2 font-medium">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.diffs
                      .filter((diff) => !hideUnchanged || diff.status !== "unchanged")
                      .map((diff) => (
                      <DiffRow key={diff.entry} diff={diff} hideUnreliable={showUnreliableFilter ? hideUnreliable : false} />
                    ))}
                  </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiffRow({ diff, hideUnreliable }: { diff: EntryDiff; hideUnreliable: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const visibleFields = diff.fields?.filter((f) => !hideUnreliable || !f.unreliable);

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/30 ${visibleFields?.length ? "cursor-pointer" : ""}`}
        onClick={() => visibleFields?.length && setExpanded(!expanded)}
      >
        <td className="px-3 py-2 font-mono">{diff.entry}</td>
        <td className="px-3 py-2">{diff.name}</td>
        <td className="px-3 py-2">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
              diff.status === "new"
                ? "bg-purple-500/20 text-purple-400"
                : diff.status === "unchanged"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            {diff.status}
          </span>
        </td>
        <td className="px-3 py-2 text-muted-foreground">
          {visibleFields?.length
            ? `${visibleFields.length} field${visibleFields.length > 1 ? "s" : ""} ${expanded ? "▾" : "▸"}`
            : "—"}
        </td>
      </tr>
      {expanded && visibleFields && visibleFields.length > 0 && (
        <tr>
          <td colSpan={4} className="px-3 py-2 bg-muted/20">
            <div className="space-y-1 text-xs font-mono">
              {visibleFields.map((f) => (
                <div key={f.field} className={`flex gap-2 ${f.unreliable ? "opacity-40" : ""}`}>
                  <span className="text-muted-foreground w-48 shrink-0">
                    {f.field}
                    {f.unreliable && (
                      <span className="ml-1 text-yellow-500" title="WDB client cache may not reliably populate this field">⚠</span>
                    )}
                  </span>
                  <span className="text-red-400">{String(f.old)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-green-400">{String(f.new)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
