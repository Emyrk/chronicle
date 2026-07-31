import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Upload as UploadIcon,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { compressFile } from "@/api/compress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { formatStorageBytes } from "@/utils/storage";

type FileStatus = "pending" | "compressing" | "uploading" | "done" | "error";

interface UploadEntry {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  logId?: string;
  error?: string;
}

function statusIcon(status: FileStatus) {
  switch (status) {
    case "done":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "compressing":
    case "uploading":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: FileStatus) {
  switch (status) {
    case "pending":
      return "Queued";
    case "compressing":
      return "Compressing…";
    case "uploading":
      return "Uploading…";
    case "done":
      return "Done";
    case "error":
      return "Failed";
  }
}

/** Upload a single file to the V2 endpoint. Returns the log_id on success. */
async function uploadSingleFile(
  file: File,
  format: string,
  onProgress: (pct: number) => void,
  onStatusChange: (status: FileStatus) => void,
): Promise<string> {
  onStatusChange("compressing");
  const formData = new FormData();
  const isAlreadyGzipped = file.name.endsWith(".gz");

  if (isAlreadyGzipped) {
    formData.append("combat_log", file, file.name);
  } else {
    const compressed = await compressFile(file);
    formData.append("combat_log", compressed, file.name + ".gz");
  }

  onStatusChange("uploading");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.log_id);
        } catch {
          resolve("");
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const data = JSON.parse(xhr.responseText);
          msg = data.message || msg;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error"));
    });

    let endpoint = "/api/v1/raidlogs/logs/upload-v2";
    if (format) {
      const params = new URLSearchParams();
      params.set("format", format);
      endpoint += `?${params.toString()}`;
    }

    xhr.open("POST", endpoint);
    xhr.send(formData);
  });
}

// Max concurrent uploads to avoid overwhelming the server.
const MAX_CONCURRENT = 3;

export interface MultiUploadProps {
  format: string;
}

export function MultiUpload({ format }: MultiUploadProps) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const newEntries: UploadEntry[] = files.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      status: "pending" as const,
      progress: 0,
    }));
    setEntries((prev) => [...prev, ...newEntries]);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setEntries((prev) => prev.filter((e) => e.status !== "done"));
  }, []);

  const updateEntry = useCallback(
    (id: string, patch: Partial<UploadEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      );
    },
    [],
  );

  const uploadAll = useCallback(async () => {
    const pending = entries.filter((e) => e.status === "pending" || e.status === "error");
    if (pending.length === 0) return;

    setIsUploading(true);

    // Reset errored entries back to pending
    for (const entry of pending) {
      updateEntry(entry.id, { status: "pending", progress: 0, error: undefined });
    }

    // Process in batches of MAX_CONCURRENT
    let idx = 0;
    const queue = [...pending];

    async function processOne(entry: UploadEntry) {
      try {
        const logId = await uploadSingleFile(
          entry.file,
          format,
          (pct) => updateEntry(entry.id, { progress: pct }),
          (status) => updateEntry(entry.id, { status }),
        );
        updateEntry(entry.id, { status: "done", progress: 100, logId });
      } catch (err) {
        updateEntry(entry.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Simple concurrency pool
    async function runPool() {
      const active: Promise<void>[] = [];

      while (idx < queue.length) {
        while (active.length < MAX_CONCURRENT && idx < queue.length) {
          const entry = queue[idx++];
          const p = processOne(entry).then(() => {
            active.splice(active.indexOf(p), 1);
          });
          active.push(p);
        }
        if (active.length > 0) {
          await Promise.race(active);
        }
      }

      await Promise.all(active);
    }

    await runPool();
    setIsUploading(false);
  }, [entries, format, updateEntry]);

  const pendingCount = entries.filter(
    (e) => e.status === "pending" || e.status === "error",
  ).length;
  const doneCount = entries.filter((e) => e.status === "done").length;

  // Drag handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items.length > 0) setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragging(false);
      dragCounter.current = 0;
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="container max-w-3xl mx-auto py-12 px-4">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <UploadIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Multi-File Upload</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Upload multiple combat log files. Each file is uploaded as a separate log.{" "}
          <Link to="/upload" className="text-blue-500 hover:underline">
            Single upload →
          </Link>
        </p>
      </div>

      {/* Drop zone */}
      <Card
        className={`p-8 mb-4 border-2 border-dashed cursor-pointer transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-500/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".txt,.txt.gz,.gz"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-2 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drop combat log files here or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            .txt, .txt.gz, .gz — select as many files as you need
          </p>
        </div>
      </Card>

      {/* File list */}
      {entries.length > 0 && (
        <Card className="mb-4 divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              {statusIcon(entry.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{entry.file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatStorageBytes(entry.file.size)}
                  </span>
                </div>
                {entry.status === "uploading" && (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                )}
                {entry.status === "error" && (
                  <p className="text-xs text-red-500 mt-0.5">{entry.error}</p>
                )}
                {entry.status === "done" && entry.logId && (
                  <Link
                    to={`/logs/${entry.logId}`}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    View log →
                  </Link>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {statusLabel(entry.status)}
              </span>
              {(entry.status === "pending" || entry.status === "error") && !isUploading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeEntry(entry.id);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={uploadAll}
          disabled={pendingCount === 0 || isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <UploadIcon className="h-4 w-4 mr-2" />
              Upload {pendingCount > 0 ? `${pendingCount} file${pendingCount > 1 ? "s" : ""}` : "All"}
            </>
          )}
        </Button>
        {doneCount > 0 && (
          <Button variant="outline" onClick={clearCompleted}>
            Clear completed ({doneCount})
          </Button>
        )}
        {entries.length > 0 && !isUploading && (
          <span className="text-xs text-muted-foreground ml-auto">
            {entries.length} file{entries.length !== 1 ? "s" : ""} · {doneCount} done
          </span>
        )}
      </div>
    </div>
  );
}
