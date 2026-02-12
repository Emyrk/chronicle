import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Upload as UploadIcon, FileText, Info, LogIn, AlertCircle, CheckCircle, FolderOpen, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import { useAuth } from "@/hooks/useAuth";
import { useAuthorizationCheck } from "@/api/queries";

export interface UploadViewProps {
  isAuthenticated: boolean;
  authLoading: boolean;
  hasUploadPermission: boolean;
  combatLog: File | null;
  rawCombatLog: File | null;
  uploading: boolean;
  uploadProgress: number;
  error: { message: string; call_to_action?: string; detail?: string; link?: string; link_text?: string } | null;
  success: { message: string; logId: string } | null;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>, type: "combat" | "raw") => void;
  onUpload: () => void;
}

export function UploadView({
  isAuthenticated,
  authLoading,
  hasUploadPermission,
  combatLog,
  rawCombatLog,
  uploading,
  uploadProgress,
  error,
  success,
  onFileSelect,
  onUpload,
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

          {/* File Selection */}
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
            <label className="block">
              <input
                type="file"
                accept=".txt"
                onChange={(e) => onFileSelect(e, "combat")}
                className="hidden"
              />
              <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors">
                {combatLog ? (
                  <div className="space-y-1">
                    <FileText className="h-8 w-8 mx-auto text-primary" />
                    <p className="text-sm font-medium">{combatLog.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(combatLog.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <UploadIcon className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to select file
                    </p>
                  </div>
                )}
              </div>
            </label>
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
            <label className="block">
              <input
                type="file"
                accept=".txt,.csv"
                onChange={(e) => onFileSelect(e, "raw")}
                className="hidden"
              />
              <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors">
                {rawCombatLog ? (
                  <div className="space-y-1">
                    <FileText className="h-8 w-8 mx-auto text-primary" />
                    <p className="text-sm font-medium">{rawCombatLog.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(rawCombatLog.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <UploadIcon className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to select file
                    </p>
                  </div>
                )}
              </div>
            </label>
          </div>
        </Card>
      </div>

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
        disabled={!combatLog || !rawCombatLog || uploading}
        className="w-full md:w-auto"
      >
        <UploadIcon className="h-4 w-4 mr-2" />
        {uploading ? "Uploading..." : "Upload Files"}
      </Button>
        </>
      )}

      {/* Requirements */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Raid Log Uploading</h2>
        </div>

        <div className="space-y-6 text-sm">
          <div>
            <h3 className="font-medium mb-2">Requirements</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <a href="https://github.com/balakethelock/SuperWoW" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  SuperWoW Mod
                </a>
              </li>
              <li>
                <a href="https://github.com/Emyrk/ChronicleCompanion/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  ChronicleCompanion Addon
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium mb-2">On Raid Night</h3>
            <div className="space-y-3 text-muted-foreground">
              <div>
                <p className="mb-1">1. <strong className="text-foreground">Delete these files before raiding:</strong></p>
                <ul className="list-none space-y-1 ml-4">
                  <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">&lt;TurtleWoWFolder&gt;/Logs/WoWCombatLog.txt</code></li>
                  <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">&lt;TurtleWoWFolder&gt;/Logs/WoWRawCombatLog.txt</code></li>
                </ul>
              </div>
              <p>2. <strong className="text-foreground">Launch WoW and do your raid.</strong></p>
              <div>
                <p className="mb-1">3. <strong className="text-foreground">Upload both files</strong> (required):</p>
                <ul className="list-none space-y-1 ml-4">
                  <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">&lt;TurtleWoWFolder&gt;/Logs/WoWCombatLog.txt</code></li>
                  <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">&lt;TurtleWoWFolder&gt;/Logs/WoWRawCombatLog.txt</code></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-medium mb-3">FAQ</h3>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-foreground">Why delete my logs?</p>
                <p className="text-muted-foreground mt-1">
                  The WoW client writes to the logs but never deletes them, so they grow continuously. 
                  Starting fresh gives the parser less data to process. Switching characters mid-session 
                  can also confuse the parser.
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">What is the ChronicleCompanion addon?</p>
                <p className="text-muted-foreground mt-1">
                  It replaces and extends SuperWoWCombatLogger with additional logging information.
                  Chronicle uses different log formats than TurtLogs, so we maintain our own addon.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function Upload() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Check upload permission via SpiceDB
  const authzChecks = useMemo(() => ({ 
    upload: "chronicle:chronicle#upload_log" 
  }), []);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated,
  });
  const hasUploadPermission = authz?.upload ?? false;
  const [combatLog, setCombatLog] = useState<File | null>(null);
  const [rawCombatLog, setRawCombatLog] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<{ message: string; call_to_action?: string; detail?: string; link?: string; link_text?: string } | null>(null);
  const [success, setSuccess] = useState<{ message: string; logId: string } | null>(null);

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "combat" | "raw"
  ) => {
    const file = e.target.files?.[0] || null;
    if (type === "combat") {
      setCombatLog(file);
    } else {
      setRawCombatLog(file);
    }
  };

  const handleUpload = () => {
    if (!combatLog || !rawCombatLog) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("combat_log_1", combatLog);
    formData.append("combat_log_2", rawCombatLog);

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
            logId: data.log_id 
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
              call_to_action: "Ask for the alpha role in Discord to get upload access.",
            });
          } else {
            setError({ 
              message: data.message || "Upload failed",
              call_to_action: data.call_to_action,
              detail: data.detail,
              link: data.link,
              link_text: data.link_text,
            });
          }
        } catch {
          if (xhr.status === 403) {
            setError({ 
              message: "You don't have permission to upload logs.",
              call_to_action: "Ask for the alpha role in Discord to get upload access.",
            });
          } else {
            setError({ message: "Upload failed" });
          }
        }
      }
    });

    xhr.addEventListener("error", () => {
      setUploading(false);
      setError({ message: "Upload failed - network error" });
    });

    xhr.open("POST", "/api/v1/raidlogs/logs/upload");
    xhr.send(formData);
  };

  return (
    <UploadView
      isAuthenticated={isAuthenticated}
      authLoading={authLoading}
      hasUploadPermission={hasUploadPermission}
      combatLog={combatLog}
      rawCombatLog={rawCombatLog}
      uploading={uploading}
      uploadProgress={uploadProgress}
      error={error}
      success={success}
      onFileSelect={handleFileSelect}
      onUpload={handleUpload}
    />
  );
}
