import { TriangleAlert, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";

interface Phase {
  encounter_id: string;
  start_offset_ms: number;
  end_offset_ms: number;
  reconstructed: boolean;
}
interface Omission {
  encounter_id: string;
  stream: string;
  unit_guid: string;
  amount: number;
  count: number;
  reason: string;
}
interface RazorgoreDetails { phases: Phase[]; omissions: Omission[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function isPhase(value: unknown): value is Phase {
  return isRecord(value) && typeof value.encounter_id === "string"
    && isFiniteNumber(value.start_offset_ms) && isFiniteNumber(value.end_offset_ms)
    && value.end_offset_ms >= value.start_offset_ms && typeof value.reconstructed === "boolean";
}
function isOmission(value: unknown): value is Omission {
  return isRecord(value) && typeof value.encounter_id === "string" && typeof value.stream === "string"
    && typeof value.unit_guid === "string" && typeof value.reason === "string"
    && isFiniteNumber(value.amount) && isFiniteNumber(value.count) && Number.isInteger(value.count) && value.count >= 0;
}
function isRazorgoreDetails(value: unknown): value is RazorgoreDetails {
  return isRecord(value) && Array.isArray(value.phases) && value.phases.every(isPhase)
    && Array.isArray(value.omissions) && value.omissions.every(isOmission);
}
function warningMessages(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function hasWarnings(warnings: unknown, details: unknown) {
  return warningMessages(warnings).length > 0
    || (isRecord(details) && Array.isArray(details.omissions) && details.omissions.length > 0);
}
function offset(milliseconds: number) {
  const sign = milliseconds < 0 ? "−" : "";
  const seconds = Math.abs(milliseconds) / 1000;
  return `${sign}${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}
function jsonText(value: unknown) {
  try { return JSON.stringify(value, null, 2) ?? "No details provided."; }
  catch { return "Details could not be displayed."; }
}

/** Shared by public receipts and admin dry-runs. Unstructured payloads never
 * select a job renderer until the complete known shape has been validated. */
export function RepairDetails({ operation, version, warnings, details }: {
  operation: string;
  version: number;
  warnings?: unknown;
  details?: unknown;
}) {
  const messages = warningMessages(warnings);
  const known = operation === "razorgore-phase-two" && version === 1 && isRazorgoreDetails(details);
  return <div className="space-y-3 text-xs">
    {hasWarnings(warnings, details) && <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-300">
      <p className="font-medium">Repair warnings</p>
      {messages.length > 0 && <ul className="mt-1 list-inside list-disc">{messages.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      {!messages.length && <p>Some values were omitted. Review the omission details.</p>}
    </div>}
    {known ? <>
      <h4 className="font-medium">Phase-two windows</h4>
      <p className="text-muted-foreground">Offsets from each encounter start (minutes:seconds).</p>
      {!details.phases.length && <p>No phase windows reported.</p>}
      <ul className="space-y-2">{details.phases.map((phase, index) => <li key={index} className="rounded border p-2">
        <p className="break-all font-mono">Encounter {phase.encounter_id}</p>
        <p className="mt-1 font-mono">{offset(phase.start_offset_ms)} to {offset(phase.end_offset_ms)}</p>
        <p className="mt-1">{phase.reconstructed ? "Reconstructed phase window" : "Recorded phase window"}</p>
      </li>)}</ul>
      <h4 className="font-medium">Omitted values</h4>
      {!details.omissions.length ? <p className="text-muted-foreground">No omitted values reported.</p> : <ul className="space-y-2">{details.omissions.map((omission, index) => <li key={index} className="space-y-1 rounded border border-amber-500/30 p-2">
        <p className="font-medium">{omission.stream}: {omission.amount.toLocaleString("en-US")} omitted across {omission.count.toLocaleString("en-US")} events</p>
        <p className="break-words">{omission.reason}</p>
        <p className="break-all font-mono text-muted-foreground">Encounter {omission.encounter_id}</p>
        <p className="break-all font-mono text-muted-foreground">Unit {omission.unit_guid}</p>
      </li>)}</ul>}
    </> : <p className="text-muted-foreground">{details == null ? "Detailed repair data is not available." : "No compatible detail view for this payload. Inspect the saved JSON below."}</p>}
    {details != null && <details><summary className="cursor-pointer text-muted-foreground">Saved repair JSON</summary>
      <pre className="styled-scrollbar mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">{jsonText(details)}</pre>
    </details>}
  </div>;
}

// Minimal runtime shape accepted at the rendering boundary, including older payloads.
interface RepairReceipt {
  operation_id: string;
  operation: string;
  version: number;
  applied_at: string;
  warnings?: unknown;
  details?: unknown;
}
function isReceipt(value: unknown): value is RepairReceipt {
  return isRecord(value) && typeof value.operation_id === "string" && typeof value.operation === "string"
    && isFiniteNumber(value.version) && typeof value.applied_at === "string";
}

function validReceipts(repairs: unknown): RepairReceipt[] {
  return Array.isArray(repairs) ? repairs.filter(isReceipt) : [];
}

/** Full receipt data, shown inside the instance repair modal. */
export function RepairReceiptList({ repairs }: { repairs?: unknown }) {
  const receipts = validReceipts(repairs);
  if (!receipts.length) return null;
  return <div className="space-y-4" aria-label="Instance repairs">
    {receipts.map((receipt, index) => <section key={`${receipt.operation_id}:${index}`} className="space-y-3 rounded border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{receipt.operation} · v{receipt.version}</span>
        {hasWarnings(receipt.warnings, receipt.details) && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-300">Warnings</span>}
        <time className="text-muted-foreground" dateTime={receipt.applied_at}>{receipt.applied_at || "Application time unavailable"}</time>
      </div>
      <p className="break-all">Repair job <code>{receipt.operation_id}</code></p>
      <RepairDetails operation={receipt.operation} version={receipt.version} warnings={receipt.warnings} details={receipt.details} />
    </section>)}
  </div>;
}

/** Uses only instance metadata. Public readers never fetch privileged admin jobs.
 * Renders a compact badge; the full receipt data opens in a modal. */
export function RepairReceipts({ repairs }: { repairs?: unknown }) {
  const receipts = validReceipts(repairs);
  if (!receipts.length) return null;
  const warned = receipts.some((receipt) => hasWarnings(receipt.warnings, receipt.details));
  const summary = receipts.length === 1 ? "1 repair" : `${receipts.length} repairs`;
  return <Dialog>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button type="button" aria-label={`Adjusted by repair${warned ? ", with warnings" : ""}`} className={warned
              ? "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px align-middle text-[10px] font-medium text-amber-300 hover:bg-amber-500/20"
              : "inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-px align-middle text-[10px] font-medium text-sky-300 hover:bg-sky-500/20"}>
              {warned ? <TriangleAlert className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
              Repaired
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">
          Some values were adjusted by {summary}. Original events remain untouched.
          {warned && " Some values could not be repaired."} Click for details.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <DialogContent className="styled-scrollbar max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Adjusted by repair</DialogTitle>
        <DialogDescription>Values on this page were adjusted by {summary}. Original events remain untouched.</DialogDescription>
      </DialogHeader>
      <RepairReceiptList repairs={receipts} />
    </DialogContent>
  </Dialog>;
}
