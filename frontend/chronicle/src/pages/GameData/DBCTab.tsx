import { useCallback, useRef, useState } from "react";
import { FileText, Upload as UploadIcon, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { DatasetSelect } from "./DatasetSelect";
import { DEFAULT_DATASET_ID } from "@/api/queries";

interface SupportedDBC {
  value: string;
  label: string;
  description: string;
  fileHint: string;
}

const SUPPORTED_DBCS: SupportedDBC[] = [
  {
    value: "ItemDisplayInfo",
    label: "ItemDisplayInfo",
    description: "Item display info and icon mappings",
    fileHint: "ItemDisplayInfo.dbc",
  },
  {
    value: "SpellItemEnchantment",
    label: "SpellItemEnchantment",
    description: "Enchantment effects and properties",
    fileHint: "SpellItemEnchantment.dbc",
  },
  {
    value: "ItemRandomProperties",
    label: "ItemRandomProperties",
    description: "Random enchantment suffixes (e.g. \"of the Owl\")",
    fileHint: "ItemRandomProperties.dbc",
  },
  {
    value: "ItemSet",
    label: "ItemSet",
    description: "Item sets, set bonuses, and set piece membership",
    fileHint: "ItemSet.dbc",
  },
];

interface DBCUploadResult {
  dbc_name: string;
  record_count: number;
  mode: string;
  inserted: number;
  updated: number;
  unchanged: number;
}

export function DBCTab() {
  const [file, setFile] = useState<File | null>(null);
  const [dbcType, setDbcType] = useState<string>(SUPPORTED_DBCS[0].value);
  const [datasetID, setDatasetID] = useState<string>(DEFAULT_DATASET_ID);
  const [mode, setMode] = useState<"compare" | "upsert" | "insert">("compare");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<DBCUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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
      formData.append("dbc_file", file);

      const response = await fetch(`/api/v1/game-data/dbc/upload?mode=${mode}&dbc_type=${dbcType}&dataset_id=${datasetID}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Upload failed (${response.status})`);
      }

      const data: DBCUploadResult = await response.json();
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
        <h2 className="text-2xl font-bold">DBC Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload DBC files extracted from a WoW client to populate game data.
          Select the DBC type from the dropdown below.
        </p>
      </div>

      <Card className="p-6 max-w-lg">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">DBC File</h3>
          </div>

          <DatasetSelect value={datasetID} onChange={setDatasetID} />

          <div>
            <label className="block text-sm font-medium mb-1">DBC Type</label>
            <select
              value={dbcType}
              onChange={(e) => setDbcType(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {SUPPORTED_DBCS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label} — {d.description}
                </option>
              ))}
            </select>
          </div>

          {(() => {
            const selected = SUPPORTED_DBCS.find((d) => d.value === dbcType);
            return (
              <p className="text-sm text-muted-foreground">
                Select a <code>{selected?.fileHint ?? ".dbc"}</code> file, typically found in
                your WoW client's <code>DBFilesClient/</code> directory (extract from MPQ).
              </p>
            );
          })()}
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
              accept=".dbc"
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
                name="dbc-mode"
                value="compare"
                checked={mode === "compare"}
                onChange={() => setMode("compare")}
              />
              Compare only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="dbc-mode"
                value="insert"
                checked={mode === "insert"}
                onChange={() => setMode("insert")}
              />
              Insert missing only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="dbc-mode"
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
        <Alert className="max-w-md">
          <AlertTitle>
            {result.mode === "compare" ? "Compare Complete" : "Import Complete"}
          </AlertTitle>
          <AlertDescription>
            Parsed <strong>{result.record_count}</strong> records from{" "}
            <code>{result.dbc_name}.dbc</code>.
            {result.mode !== "compare" && (
              <span className="block mt-1">
                <strong>{result.inserted}</strong> inserted,{" "}
                <strong>{result.updated}</strong> updated,{" "}
                <strong>{result.unchanged}</strong> unchanged
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
