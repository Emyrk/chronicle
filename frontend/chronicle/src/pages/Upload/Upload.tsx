import { useState, useMemo, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Upload as UploadIcon, FileText, Info, LogIn, AlertCircle, CheckCircle, FolderOpen, AlertTriangle, ArrowRight } from "lucide-react";
import { compressFile } from "@/api/compress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { Switch } from "@/components/ui/Switch/Switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorizationCheck, useSiteConfig, useFlavors } from "@/api/queries";
import {
  serverCapabilities,
  hasExplicitServerCapabilities,
  LOG_FORMAT_OPTIONS,
} from "@/config/serverCapabilities";
import { InstructionsSuperwow } from "./InstructionsSuperwow";
import { InstructionsWotlk } from "./InstructionsWotlk";
import { InstructionsChronicleCompanion } from "./InstructionsChronicleCompanion";
import { MultiUpload } from "./MultiUpload";
import { formatStorageBytes } from "@/utils/storage";

/** Reusable file drop zone — supports click-to-browse and drag-and-drop. */
function FileDropZone({
  file,
  accept,
  onFile,
  label,
}: {
  file: File | null;
  accept: string;
  onFile: (file: File) => void;
  label: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

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
    if (dragCounter.current === 0) setDragging(false);
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
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        dragging
          ? "border-primary bg-primary/5"
          : "hover:border-primary"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
        className="hidden"
      />
      {file ? (
        <div className="space-y-1">
          <FileText className="h-8 w-8 mx-auto text-primary" />
          <p className="text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatStorageBytes(file.size)}</p>
        </div>
      ) : (
        <div className="space-y-1">
          <UploadIcon className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      )}
    </div>
  );
}

export interface UploadViewProps {
  isAuthenticated: boolean;
  authLoading: boolean;
  hasUploadPermission: boolean;
  hasAdminLogs: boolean;
  combatLog: File | null;
  rawCombatLog: File | null;
  uploading: boolean;
  uploadProgress: number;
  error: { message: string; call_to_action?: string; detail?: string; link?: string; link_text?: string } | null;
  success: { message: string; logId: string } | null;
  onFileDrop: (file: File, type: "combat" | "raw") => void;
  onUpload: () => void;
  useV2Upload: boolean;
  onToggleV2Upload: (checked: boolean) => void;
  showLegacy: boolean;
  flavorOverride: string;
  onFlavorOverrideChange: (value: string) => void;
  /** Resolved format for display: admin pick → user pick → default. */
  effectiveFormat: string;
  /** Whether the site config has finished loading. */
  configLoaded: boolean;
  /** All known flavor tags from the server. */
  flavorTags: string[];
  /** Format options available to the user. */
  availableFormats: { value: string; label: string }[];
  /** User's currently selected format (may be empty = use default). */
  selectedFormat: string;
  /** Callback when the user picks a format. */
  onFormatSelect: (value: string) => void;
}

export function UploadView({
  isAuthenticated,
  authLoading,
  hasUploadPermission,
  hasAdminLogs,
  combatLog,
  rawCombatLog,
  uploading,
  uploadProgress,
  error,
  success,
  onFileDrop,
  onUpload,
  useV2Upload,
  onToggleV2Upload,
  showLegacy,
  flavorOverride,
  onFlavorOverrideChange,
  effectiveFormat,
  flavorTags,
  availableFormats,
  selectedFormat,
  onFormatSelect,
  configLoaded,
}: UploadViewProps) {
  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Upload Raid Logs</h1>
          <p className="text-muted-foreground mt-2">
            Upload your combat log and raid roster to analyze your raid performance.
          </p>
        </div>
        {isAuthenticated && (
          <Link to="/logs">
            <Button variant="outline">
              <FolderOpen className="h-4 w-4 mr-2" />
              View My Logs
            </Button>
          </Link>
        )}
      </div>

      {/* Permission Warning */}
      {isAuthenticated && !hasUploadPermission && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10 text-yellow-200 [&>svg]:text-yellow-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-yellow-200">Upload Access Required</AlertTitle>
          <AlertDescription className="text-yellow-200/80">
            You don't have permission to upload logs yet. Ask for the alpha role in the Chronicle Discord server to get upload access.
          </AlertDescription>
        </Alert>
      )}

      {/* Backup Warning */}
      <Alert className="border-orange-500/50 bg-orange-500/10 text-orange-200 [&>svg]:text-orange-500">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="text-orange-200">Backup Your Log Files</AlertTitle>
        <AlertDescription className="text-orange-200/80">
          <p>
            Chronicle is in early development and uploaded logs <b>will be deleted</b> at some point.
            Always keep a backup of your original log files somewhere safe.
          </p>
        </AlertDescription>
      </Alert>


      {/* Auth Check */}
      {!authLoading && !isAuthenticated ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="font-semibold text-lg">Authentication Required</h2>
              <p className="text-muted-foreground mt-1">
                You must be logged in to upload raid logs.
              </p>
            </div>
            <Link to="/login?from=/upload">
              <Button>
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            </Link>
          </div>
        </Card>
      ) : success ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <div>
              <h2 className="font-semibold text-lg">Upload Successful</h2>
              <p className="text-muted-foreground mt-1">{success.message}</p>
            </div>
            <Link to={`/logs/${success.logId}`}>
              <Button>
                View Upload
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload Failed</AlertTitle>
              <AlertDescription>
                {error.message}
                {error.call_to_action && (
                  <p className="mt-2 text-sm">{error.call_to_action}</p>
                )}
                {error.link && (
                  <Link to={error.link} className="mt-3 inline-block">
                    <Button variant="outline" size="sm" className="bg-background/10 border-current hover:bg-background/20">
                      {error.link_text || "View Details"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                )}
                {error.detail && (
                  <pre className="mt-2 font-mono text-xs bg-destructive/10 p-2 rounded whitespace-pre-wrap break-words">
                    {error.detail}
                  </pre>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Format selector — visible to everyone when >1 available, or always for admins */}
          {(availableFormats.length > 1 || hasAdminLogs) && (
            <div className="flex items-center gap-2">
              <Label htmlFor="format-select" className="text-sm font-medium whitespace-nowrap">
                Log Format
              </Label>
              <select
                id="format-select"
                value={selectedFormat}
                onChange={(e) => onFormatSelect(e.target.value)}
                className="h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Default</option>
                {(hasAdminLogs ? LOG_FORMAT_OPTIONS : availableFormats).map((opt) => {
                  const isAvailable = availableFormats.some((a) => a.value === opt.value);
                  return (
                    <option key={opt.value} value={opt.value} className={!isAvailable ? "text-muted-foreground" : ""}>
                      {opt.label}{!isAvailable ? " (other)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Admin-only flavor override */}
          {hasAdminLogs && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Flavor</Label>
                <div className="flex flex-wrap gap-2">
                  {flavorTags.map((tag) => {
                    const selected = flavorOverride.split(",").filter(Boolean);
                    const isChecked = selected.includes(tag);
                    return (
                      <label
                        key={tag}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono cursor-pointer select-none transition-colors ${
                          isChecked
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-background border-input text-muted-foreground hover:border-foreground/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isChecked}
                          onChange={() => {
                            const next = isChecked
                              ? selected.filter((t) => t !== tag)
                              : [...selected, tag];
                            onFlavorOverrideChange(next.join(","));
                          }}
                        />
                        {tag}
                      </label>
                    );
                  })}
                </div>
                {flavorOverride === "" && (
                  <p className="text-[10px] text-muted-foreground">
                    No tags selected — flavor will be resolved from the dataset after realm detection.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* V2 Upload Toggle - only visible with ?debug=true */}
          {showLegacy && (
            <div className="flex items-center gap-3">
              <Switch
                id="upload-version"
                checked={!useV2Upload}
                onCheckedChange={(checked: boolean) => onToggleV2Upload(!checked)}
              />
              <Label htmlFor="upload-version" className="cursor-pointer">
                Use legacy upload (two files)
              </Label>
            </div>
          )}

          {/* File Selection */}
          {useV2Upload ? (
            // V2: Single file upload
            <Card className="p-6 max-w-md mx-auto">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold">Combat Log</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Select{" "}
                  {effectiveFormat === "1.12a-cc-addon" ? (
                    <code>/CustomData/Chronicle_&lt;character_name&gt;.txt</code>
                  ) : (
                    <code>/Logs/WoWCombatLog.txt</code>
                  )}{" "}
                  file
                </p>
                <FileDropZone
                  file={combatLog}
                  accept=".txt,.txt.gz,.gz"
                  onFile={(f) => onFileDrop(f, "combat")}
                  label="Click or drag file here"
                />
                <p className="text-[10px] text-muted-foreground mt-1 text-center">
                  Uploading as{" "}
                  {effectiveFormat ? (
                    <span className="font-mono">{effectiveFormat}</span>
                  ) : (
                    <span className="font-mono">server default</span>
                  )}
                  {flavorOverride && (
                    <>
                      {" · "}
                      <span className="font-mono">
                        [{flavorOverride.split(",").join(", ")}]
                      </span>
                    </>
                  )}
                </p>
              </div>
            </Card>
          ) : (
            // V1: Original 2-file upload
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <h2 className="font-semibold">Combat Log</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select your WoWCombatLog.txt file
                  </p>
                  <FileDropZone
                    file={combatLog}
                    accept=".txt,.txt.gz,.gz"
                    onFile={(f) => onFileDrop(f, "combat")}
                    label="Click or drag file here"
                  />
                </div>
              </Card>

              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <h2 className="font-semibold">Raw Combat Log</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select your WoWRawCombatLog.txt
                  </p>
                  <FileDropZone
                    file={rawCombatLog}
                    accept=".txt,.csv,.txt.gz,.gz"
                    onFile={(f) => onFileDrop(f, "raw")}
                    label="Click or drag file here"
                            />
                </div>
              </Card>
            </div>
          )}

      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      <Button
        onClick={onUpload}
        disabled={useV2Upload ? !combatLog || uploading : !combatLog || !rawCombatLog || uploading}
        className="w-full md:w-auto"
      >
        <UploadIcon className="h-4 w-4 mr-2" />
        {uploading ? "Uploading..." : useV2Upload ? "Upload File" : "Upload Files"}
      </Button>
        </>
      )}

      {/* Instructions — wait for config to avoid flashing the wrong variant */}
      {configLoaded && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Raid Log Uploading</h2>
          </div>

          <div className="space-y-6 text-sm">
            {effectiveFormat === "1.12a-superwow-addon" ? (
              <InstructionsSuperwow />
            ) : effectiveFormat === "3.3.5a-cc-addon" || effectiveFormat === "azerothcore-mod" ? (
              <InstructionsWotlk />
            ) : (
              <InstructionsChronicleCompanion />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export function Upload() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Check upload + admin_logs permissions via SpiceDB
  const authzChecks = useMemo(() => ({ 
    upload: "chronicle:chronicle#upload_log",
    adminLogs: "chronicle:chronicle#admin_logs",
  }), []);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });
  const hasUploadPermission = authz?.upload ?? false;
  const hasAdminLogs = authz?.adminLogs ?? false;

  const { data: siteConfig, isFetched: configLoaded } = useSiteConfig();
  const { data: flavorTags = [] } = useFlavors();
  const uploadsDisabled = siteConfig?.client_uploads_disabled && !hasAdminLogs;

  // ── Format resolution ──────────────────────────────────────────────
  // Available formats: tenant > site config > all known formats.
  // Default format: tenant > site config > compiled-in server default.
  const tenant = siteConfig?.tenant;
  const availableFormatSource = tenant?.available_formats?.length
    ? tenant.available_formats
    : siteConfig?.available_formats?.length
      ? siteConfig.available_formats
      : LOG_FORMAT_OPTIONS.map((o) => o.value);
  const availableFormats = LOG_FORMAT_OPTIONS.filter((o) => availableFormatSource.includes(o.value));

  const defaultFormat = tenant?.default_format
    ?? siteConfig?.default_format
    ?? (hasExplicitServerCapabilities ? serverCapabilities.defaultFormat : "");

  // User-selected format, persisted to localStorage. Falls back to the
  // resolved default. Reset if the stored value isn't in available list.
  const STORAGE_KEY = "chronicle:upload-format";
  const [selectedFormat, setSelectedFormat] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ?? "";
  });
  const handleFormatSelect = useCallback((value: string) => {
    setSelectedFormat(value);
    if (value) {
      localStorage.setItem(STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Effective format: user pick (if in available list) → default.
  const effectiveFormat = (selectedFormat && availableFormats.some((o) => o.value === selectedFormat))
    ? selectedFormat
    : defaultFormat;

  // Admin-only flavor override (sent as query param).
  const [flavorOverride, setFlavorOverride] = useState<string>("");

  const [combatLog, setCombatLog] = useState<File | null>(null);
  const [rawCombatLog, setRawCombatLog] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<{ message: string; call_to_action?: string; detail?: string; link?: string; link_text?: string } | null>(null);
  const [success, setSuccess] = useState<{ message: string; logId: string } | null>(null);
  const [searchParams] = useSearchParams();
  const isMultiple = searchParams.get("multiple") === "true";
  const showLegacy = searchParams.get("debug") === "true";
  const [useV2Upload, setUseV2Upload] = useState(true);

  const handleToggleV2Upload = useCallback((checked: boolean) => {
    setUseV2Upload(checked);
    // Clear files when switching modes
    setCombatLog(null);
    setRawCombatLog(null);
    setError(null);
    setSuccess(null);
  }, []);

  const handleFileDrop = (file: File, type: "combat" | "raw") => {
    if (type === "combat") {
      setCombatLog(file);
    } else {
      setRawCombatLog(file);
    }
  };

  const handleUpload = useCallback(async () => {
    // V2 only needs combatLog; V1 needs both
    if (useV2Upload) {
      if (!combatLog) return;
    } else {
      if (!combatLog || !rawCombatLog) return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();

      const isAlreadyGzipped = (file: File) => file.name.endsWith(".gz");

      if (useV2Upload) {
        // V2 upload: single file
        if (isAlreadyGzipped(combatLog)) {
          formData.append("combat_log", combatLog, combatLog.name);
        } else {
          const compressedLog = await compressFile(combatLog);
          formData.append("combat_log", compressedLog, combatLog.name + ".gz");
        }
      } else {
        // V1 upload: two files
        if (isAlreadyGzipped(combatLog)) {
          formData.append("combat_log_1", combatLog, combatLog.name);
        } else {
          const compressedLog = await compressFile(combatLog);
          formData.append("combat_log_1", compressedLog, combatLog.name + ".gz");
        }
        if (isAlreadyGzipped(rawCombatLog!)) {
          formData.append("combat_log_2", rawCombatLog!, rawCombatLog!.name);
        } else {
          const compressedRawLog = await compressFile(rawCombatLog!);
          formData.append("combat_log_2", compressedRawLog, rawCombatLog!.name + ".gz");
        }
      }

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        setUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            setSuccess({
              message: "Your logs are being processed.",
              logId: data.log_id,
            });
          } catch {
            setSuccess({ message: "Upload successful", logId: "" });
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            // Special handling for 403 - missing role
            if (xhr.status === 403) {
              setError({
                message: "You don't have permission to upload logs.",
                call_to_action:
                  "Ask for the alpha role in Discord to get upload access.",
              });
            } else {
              setError({
                message: data.message || "Upload failed",
                call_to_action:
                  data.call_to_action ||
                  "Try relogging in-game, then upload the logs again.",
                detail: data.detail,
                link: data.link,
                link_text: data.link_text,
              });
            }
          } catch {
            if (xhr.status === 403) {
              setError({
                message: "You don't have permission to upload logs.",
                call_to_action:
                  "Ask for the alpha role in Discord to get upload access.",
              });
            } else {
              setError({
                message: "Upload failed",
                call_to_action: "Try relogging in-game, then upload the logs again.",
              });
            }
          }
        }
      });

      xhr.addEventListener("error", () => {
        setUploading(false);
        setError({
          message: "Upload failed - network error",
          call_to_action: "Check your connection, then try relogging and uploading again.",
        });
      });

      // Use different endpoint based on upload version
      let endpoint = useV2Upload
        ? "/api/v1/raidlogs/logs/upload-v2"
        : "/api/v1/raidlogs/logs/upload";
      if (useV2Upload) {
        // Send the resolved format and any admin flavor override.
        const params = new URLSearchParams();
        if (effectiveFormat) params.set("format", effectiveFormat);
        if (flavorOverride) params.set("flavor", flavorOverride);
        endpoint += `?${params.toString()}`;
      }
      xhr.open("POST", endpoint);
      xhr.send(formData);
    } catch (err) {
      setUploading(false);
      setError({
        message: "Failed to compress files before upload",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }, [combatLog, rawCombatLog, useV2Upload, effectiveFormat, flavorOverride]);

  if (isMultiple) {
    return <MultiUpload format={effectiveFormat} />;
  }

  if (uploadsDisabled) {
    return (
      <div className="container max-w-2xl mx-auto py-12 px-4 text-center">
        <Card className="p-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Uploads Disabled</h2>
          <p className="text-muted-foreground">
            Client-side uploads are not available.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <UploadView
      isAuthenticated={isAuthenticated}
      authLoading={authLoading}
      hasUploadPermission={hasUploadPermission}
      hasAdminLogs={hasAdminLogs}
      combatLog={combatLog}
      rawCombatLog={rawCombatLog}
      uploading={uploading}
      uploadProgress={uploadProgress}
      error={error}
      success={success}
      onFileDrop={handleFileDrop}
      onUpload={handleUpload}
      useV2Upload={useV2Upload}
      onToggleV2Upload={handleToggleV2Upload}
      showLegacy={showLegacy}
      flavorOverride={flavorOverride}
      onFlavorOverrideChange={setFlavorOverride}
      effectiveFormat={effectiveFormat}
      flavorTags={flavorTags}
      availableFormats={availableFormats}
      selectedFormat={selectedFormat}
      onFormatSelect={handleFormatSelect}
      configLoaded={configLoaded}
    />
  );
}
