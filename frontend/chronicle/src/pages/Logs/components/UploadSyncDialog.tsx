import { ArrowRight, FileJson, Sparkles, Upload, Youtube } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UploadSyncOptionsProps {
  instanceId: string;
  uploading: boolean;
  onManualUpload: () => void;
  onWizardOpen?: () => void;
}

export function UploadSyncOptions({
  instanceId,
  uploading,
  onManualUpload,
  onWizardOpen,
}: UploadSyncOptionsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="group flex flex-col rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/10">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-md bg-cyan-500/15 p-2 text-cyan-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300">
            Recommended
          </span>
        </div>
        <h3 className="mt-4 font-semibold">Create with Sync Wizard</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate sync points from a YouTube raid recording with Chronicle&apos;s guided tool.
        </p>
        <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>1. Paste the YouTube video URL.</li>
          <li>2. Share the player window and select the in-game clock.</li>
          <li>3. Run the sync, then export it to this Chronicle instance.</li>
        </ol>
        <div className="mt-3 rounded-md border border-border/70 bg-background/60 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Instance ID</p>
          <code className="mt-0.5 block truncate text-xs text-foreground" title={instanceId}>
            {instanceId}
          </code>
        </div>
        <Button asChild className="mt-4 w-full">
          <Link to="/youtube-sync-v3" onClick={onWizardOpen}>
            Open Sync Wizard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="flex flex-col rounded-lg border bg-muted/20 p-4 transition-colors hover:border-foreground/25 hover:bg-muted/35">
        <div className="w-fit rounded-md bg-muted p-2 text-muted-foreground">
          <FileJson className="h-5 w-5" />
        </div>
        <h3 className="mt-4 font-semibold">Upload an Existing File</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Already generated sync data? Attach the JSON file directly to this raid.
        </p>
        <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>1. Choose a <span className="font-mono">youtube-sync.json</span> file.</li>
          <li>2. Chronicle validates the video URL and timing points.</li>
          <li>3. The sync is attached to this instance automatically.</li>
        </ol>
        <div className="mt-auto pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onManualUpload}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Upload className="mr-2 h-4 w-4 animate-pulse" />
                Uploading Sync File…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Choose JSON File
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface UploadSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
  uploading: boolean;
  onManualUpload: () => void;
}

export function UploadSyncDialog({
  open,
  onOpenChange,
  instanceId,
  instanceName,
  uploading,
  onManualUpload,
}: UploadSyncDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto styled-scrollbar">
        <DialogHeader className="pr-8">
          <div className="mb-1 flex items-center gap-2 text-red-400">
            <Youtube className="h-5 w-5" />
            <span className="text-xs font-medium uppercase tracking-[0.18em]">YouTube Sync</span>
          </div>
          <DialogTitle>Add video synchronization</DialogTitle>
          <DialogDescription>
            Attach a YouTube recording to {instanceName}. Choose the guided wizard to create sync data, or upload a JSON file you already have.
          </DialogDescription>
        </DialogHeader>
        <UploadSyncOptions
          instanceId={instanceId}
          uploading={uploading}
          onManualUpload={onManualUpload}
          onWizardOpen={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
