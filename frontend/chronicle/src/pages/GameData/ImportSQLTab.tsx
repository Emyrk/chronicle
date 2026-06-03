import { useCallback, useRef, useState } from "react";
import { FileText, Upload as UploadIcon, Database, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { DatasetSelect } from "./DatasetSelect";
import { DEFAULT_DATASET_ID } from "@/api/queries";

interface FieldDiff {
  field: string;
  old: unknown;
  new: unknown;
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

interface SQLSource {
  label: string;
  url: string;
}

interface SupportedTable {
  value: string;
  label: string;
  description: string;
  sources: SQLSource[];
}

const SUPPORTED_TABLES: SupportedTable[] = [
  {
    value: "creature_template",
    label: "creature_template",
    description: "Creature template data",
    sources: [
      { label: "Classic", url: "https://raw.githubusercontent.com/azerothcore/database-classic/refs/heads/master/World/Setup/FullDB/creature_template.sql" },
      { label: "WoTLK", url: "https://raw.githubusercontent.com/azerothcore/database-wotlk/refs/heads/master/sql/base/creature_template.sql" },
    ],
  },
  {
    value: "item_template",
    label: "item_template",
    description: "Item template data",
    sources: [
      { label: "Classic", url: "https://raw.githubusercontent.com/azerothcore/database-classic/refs/heads/master/World/Setup/FullDB/item_template.sql" },
      { label: "WoTLK", url: "https://raw.githubusercontent.com/azerothcore/database-wotlk/refs/heads/master/sql/base/item_template.sql" },
    ],
  },
];

export function ImportSQLTab() {
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<string>(SUPPORTED_TABLES[0].value);
  const [datasetID, setDatasetID] = useState<string>(DEFAULT_DATASET_ID);
  const [mode, setMode] = useState<"compare" | "upsert" | "insert">("compare");
  const [uploading, setUploading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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
      if (dropped) selectFile(dropped);
    },
    [selectFile],
  );

  const onFetchFromURL = async (sourceUrl: string) => {
    setFetchingUrl(sourceUrl);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/v1/game-data/sql/import-url?mode=${mode}&table=${table}&dataset_id=${datasetID}&url=${encodeURIComponent(sourceUrl)}`,
        { method: "POST" },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Import failed (${response.status})`);
      }

      const data: UploadResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setFetchingUrl(null);
    }
  };

  const onUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("sql_file", file);

      const response = await fetch(`/api/v1/game-data/sql/import?mode=${mode}&table=${table}&dataset_id=${datasetID}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Import failed (${response.status})`);
      }

      const data: UploadResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">SQL Dump Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Import game data from AzerothCore/TrinityCore MySQL dump files (<code>.sql</code>).
          Parses INSERT statements and maps them to Chronicle's database schema.
        </p>
      </div>

      <Card className="p-6 max-w-lg">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">SQL File</h3>
          </div>

          <DatasetSelect value={datasetID} onChange={setDatasetID} />

          <div>
            <label className="block text-sm font-medium mb-1">Target Table</label>
            <select
              value={table}
              onChange={(e) => setTable(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {SUPPORTED_TABLES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.description}
                </option>
              ))}
            </select>
            {(() => {
              const selected = SUPPORTED_TABLES.find((t) => t.value === table);
              if (!selected?.sources.length) return null;
              return (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Fetch from AzerothCore GitHub:</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.sources.map((source) => (
                      <div key={source.label} className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={!!fetchingUrl || uploading}
                          onClick={() => onFetchFromURL(source.url)}
                        >
                          {fetchingUrl === source.url ? (
                            <>Processing…</>
                          ) : (
                            <>
                              <Download className="h-3 w-3" />
                              {source.label}
                            </>
                          )}
                        </Button>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title={`View ${source.label} source`}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

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
              dragOver ? "border-primary bg-primary/5" : "hover:border-primary"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".sql"
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
                  Drag & drop or click to select <code>.sql</code> file
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="sql-mode" value="compare" checked={mode === "compare"} onChange={() => setMode("compare")} />
              Compare only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="sql-mode" value="insert" checked={mode === "insert"} onChange={() => setMode("insert")} />
              Insert missing only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="sql-mode" value="upsert" checked={mode === "upsert"} onChange={() => setMode("upsert")} />
              Compare & Upsert
            </label>
          </div>

          <Button onClick={onUpload} disabled={!file || uploading || !!fetchingUrl} className="w-full">
            {uploading
              ? "Processing..."
              : mode === "upsert"
                ? "Import & Upsert"
                : mode === "insert"
                  ? "Import & Insert Missing"
                  : "Compare"}
          </Button>
        </div>
      </Card>

      {error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Import Failed</AlertTitle>
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
              Parsed {result.record_count} records from {result.signature}.
              <span className="block mt-1">
                <strong>{result.new_items}</strong> new,{" "}
                <strong>{result.changed}</strong> changed,{" "}
                <strong>{result.unchanged}</strong> unchanged
              </span>
            </AlertDescription>
          </Alert>

          {result.diffs && result.diffs.length > 0 && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hideUnchanged}
                  onChange={(e) => setHideUnchanged(e.target.checked)}
                  className="rounded"
                />
                Hide unchanged
              </label>
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
                      .filter((d) => !hideUnchanged || d.status !== "unchanged")
                      .map((diff) => (
                        <DiffRow key={diff.entry} diff={diff} />
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

function DiffRow({ diff }: { diff: EntryDiff }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/30 ${diff.fields?.length ? "cursor-pointer" : ""}`}
        onClick={() => diff.fields?.length && setExpanded(!expanded)}
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
          {diff.fields?.length
            ? `${diff.fields.length} field${diff.fields.length > 1 ? "s" : ""} ${expanded ? "▾" : "▸"}`
            : "—"}
        </td>
      </tr>
      {expanded && diff.fields && diff.fields.length > 0 && (
        <tr>
          <td colSpan={4} className="px-3 py-2 bg-muted/20">
            <div className="space-y-1 text-xs font-mono">
              {diff.fields.map((f) => (
                <div key={f.field} className="flex gap-2">
                  <span className="text-muted-foreground w-48 shrink-0">{f.field}</span>
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
