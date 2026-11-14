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
interface LucifronPlayer {
  encounter_id: string;
  player_guid: string;
  player_name: string;
  before_ranked_damage: number;
  after_ranked_damage: number;
  before_unranked_damage: number;
  after_unranked_damage: number;
  before_dps: number;
  after_dps: number;
}
interface LucifronReconciliation {
  encounter_id: string;
  player_guid: string;
  player_name: string;
  persisted_full_damage: number;
  attributed_full_damage: number;
  unexplained_damage: number;
}
interface LucifronDetails {
  parser_version: string;
  rule_version: "v1.0.173";
  ranked_target_entries: number[];
  players: LucifronPlayer[];
  reconciliation?: LucifronReconciliation[];
  omissions: Omission[];
}
function isLucifronPlayer(value: unknown): value is LucifronPlayer {
  return isRecord(value) && typeof value.encounter_id === "string" && typeof value.player_guid === "string"
    && typeof value.player_name === "string" && [value.before_ranked_damage, value.after_ranked_damage,
      value.before_unranked_damage, value.after_unranked_damage, value.before_dps, value.after_dps].every(isFiniteNumber);
}
function isReconciliation(value: unknown): value is LucifronReconciliation {
  return isRecord(value) && typeof value.encounter_id === "string" && typeof value.player_guid === "string"
    && typeof value.player_name === "string" && [value.persisted_full_damage, value.attributed_full_damage,
      value.unexplained_damage].every((amount) => isFiniteNumber(amount) && amount >= 0);
}
function isLucifronDetails(value: unknown): value is LucifronDetails {
  return isRecord(value) && typeof value.parser_version === "string" && value.rule_version === "v1.0.173"
    && Array.isArray(value.ranked_target_entries) && value.ranked_target_entries.every((entry) => isFiniteNumber(entry) && Number.isInteger(entry) && entry > 0)
    && (!("reconciliation" in value) || (Array.isArray(value.reconciliation) && value.reconciliation.every(isReconciliation)))
    && Array.isArray(value.players) && value.players.every(isLucifronPlayer)
    && Array.isArray(value.omissions) && value.omissions.every(isOmission);
}
function LucifronReport({ details }: { details: LucifronDetails }) {
  const gaps = (details.reconciliation ?? []).filter((row) => row.unexplained_damage > 0);
  const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return <div className="space-y-3">
    <h4 className="font-medium">Lucifron ranked damage</h4>
    <p className="text-muted-foreground">Parser: {details.parser_version || "Unknown"} · Ranking rule: {details.rule_version}</p>
    <p>Ranked targets: {details.ranked_target_entries.map((entry) => entry === 12118 ? "Lucifron (12118)" : entry === 12119 ? "Flamewaker Protector (12119)" : String(entry)).join(", ") || "None reported"}. Core Hounds excluded.</p>
    <div className="styled-scrollbar overflow-x-auto rounded border">
      <table className="w-full text-left text-xs">
        <caption className="p-2 text-left font-medium">Player damage and DPS, before and after repair</caption>
        <thead className="bg-muted"><tr>{["Player / encounter", "Metric", "Before", "After"].map((label) => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        {details.players.map((player, index) => <tbody key={index} className="border-t">
          <tr><th rowSpan={3} scope="rowgroup" className="min-w-40 max-w-64 break-all p-2 align-top font-normal">
            <span className="block font-medium">{player.player_name || "Unnamed player"}</span>
            <span className="block font-mono text-muted-foreground">{player.player_guid}</span>
            <span className="mt-1 block font-mono text-muted-foreground">Encounter {player.encounter_id}</span>
          </th><th scope="row" className="p-2 font-normal">Ranked damage</th><td className="p-2 font-mono">{number(player.before_ranked_damage)}</td><td className="p-2 font-mono">{number(player.after_ranked_damage)}</td></tr>
          <tr><th scope="row" className="p-2 font-normal">Unranked damage</th><td className="p-2 font-mono">{number(player.before_unranked_damage)}</td><td className="p-2 font-mono">{number(player.after_unranked_damage)}</td></tr>
          <tr><th scope="row" className="p-2 font-normal">DPS</th><td className="p-2 font-mono">{number(player.before_dps)}</td><td className="p-2 font-mono">{number(player.after_dps)}</td></tr>
        </tbody>)}
      </table>
      {!details.players.length && <p className="p-2 text-muted-foreground">No player changes reported.</p>}
    </div>
    {gaps.length > 0 && <section className="space-y-2 rounded border border-amber-500/40 bg-amber-500/5 p-3" aria-label="Historical damage reconciliation">
      <h4 className="font-medium">Historical unattributed damage</h4>
      <p>Historical damage that cannot be attributed from the available events is excluded from both repaired ranked and unranked damage. Repaired totals are a conservative lower bound based on attributable evidence.</p>
      <p className="text-muted-foreground">These gaps reconcile persisted full damage against attributed full damage. They are not additional amounts to add to the source omissions below.</p>
      <div className="styled-scrollbar overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Nonzero player damage gaps</caption>
          <thead><tr>{["Player / encounter", "Persisted full damage", "Attributed full damage", "Unexplained damage"].map((label) => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
          <tbody>{gaps.map((row, index) => <tr key={index} className="border-t align-top">
            <th scope="row" className="min-w-40 max-w-64 break-all p-2 font-normal"><span className="block font-medium">{row.player_name || "Unnamed player"}</span><span className="block font-mono text-muted-foreground">{row.player_guid}</span><span className="block font-mono text-muted-foreground">Encounter {row.encounter_id}</span></th>
            <td className="p-2 font-mono">{number(row.persisted_full_damage)}</td><td className="p-2 font-mono">{number(row.attributed_full_damage)}</td><td className="p-2 font-mono">{number(row.unexplained_damage)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </div>;
}

function Omissions({ omissions }: { omissions: Omission[] }) {
  return <>
      <h4 className="font-medium">Omitted values</h4>
      {!omissions.length ? <p className="text-muted-foreground">No omitted values reported.</p> : <ul className="space-y-2">{omissions.map((omission, index) => <li key={index} className="space-y-1 rounded border border-amber-500/30 p-2">
        <p className="font-medium">{omission.stream}: {omission.amount.toLocaleString("en-US")} omitted across {omission.count.toLocaleString("en-US")} events</p>
        <p className="break-words">{omission.reason}</p>
        <p className="break-all font-mono text-muted-foreground">Encounter {omission.encounter_id}</p>
        <p className="break-all font-mono text-muted-foreground">Unit {omission.unit_guid}</p>
      </li>)}</ul>}
  </>;
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
  const lucifron = operation === "lucifron-ranked-damage" && (version === 1 || version === 2 || version === 3) && isLucifronDetails(details);
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
      <Omissions omissions={details.omissions} />
    </> : lucifron ? <><LucifronReport details={details} /><Omissions omissions={details.omissions} /></> : <p className="text-muted-foreground">{details == null ? "Detailed repair data is not available." : "No compatible detail view for this payload. Inspect the saved JSON below."}</p>}
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
