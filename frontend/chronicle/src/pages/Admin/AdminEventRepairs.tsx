import { RepairDetails } from "@/components/EventRepair/RepairDetails";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminTenants, useRealms } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { buildRepairRequest, eventRepairKey, isRepairActive, repairRequest } from "@/api/eventRepairs";
import type { AdminEventRepairCreateRequest, AdminEventRepairList, AdminEventRepairOperation, RepairSelection } from "@/api/eventRepairs";

const inputClass = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";
const labelClass = "space-y-0.5 text-xs text-muted-foreground";

const stateTone: Record<string, string> = {
  ready: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  applied: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  skipped: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive/50 bg-destructive/10 text-destructive",
  dry_running: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  applying: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};
function StatePill({ state, role }: { state: string; role?: "status" }) {
  return <span role={role} className={`inline-flex shrink-0 rounded-full border px-1.5 py-px text-[11px] font-medium ${stateTone[state] ?? "border-border text-muted-foreground"}`}>{state.replaceAll("_", " ")}</span>;
}
/** Compact UTC timestamp; falls back to the raw value when it is not a date. */
function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function RepairReport({ operation, busy, onApply, onCancel, onRetry }: {
  operation: AdminEventRepairOperation;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
  onRetry?: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const items = operation.items ?? [];
  const hasReady = items.some((item) => item.state === "ready");
  const active = isRepairActive(operation.state);
  return <Card className="gap-2 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-sm font-semibold">Repair report</h2>
      <span className="text-sm text-muted-foreground">{operation.operation} · v{operation.version}</span>
      <StatePill state={operation.state} role="status" />
      <div className="ml-auto flex flex-wrap gap-2">
        {active && operation.last_error && onRetry && <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>Retry operation</Button>}
        {active && <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel operation</Button>}
        {operation.state === "ready" && hasReady && <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Reject repair</Button>}
      </div>
    </div>
    <p className="break-all font-mono text-[11px] text-muted-foreground">{operation.id}</p>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span><span className="text-muted-foreground">Processed</span> <b className="font-mono tabular-nums">{operation.processed}/{operation.total}</b></span>
      <span><span className="text-muted-foreground">Applied</span> <b className="font-mono tabular-nums">{operation.applied}</b></span>
      <span><span className="text-muted-foreground">Skipped</span> <b className="font-mono tabular-nums">{operation.skipped}</b></span>
      <span className="break-all text-muted-foreground">Tenant <span className="font-mono">{operation.tenant_id}</span></span>
      <span className="text-muted-foreground">Created {when(operation.created_at)} by {operation.created_by} · updated {when(operation.updated_at)}</span>
      <details className="text-muted-foreground"><summary className="cursor-pointer">Saved selection</summary><pre className="styled-scrollbar mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(operation.selection, null, 2)}</pre></details>
    </div>
    {operation.last_error && <p role="alert" className="break-words text-sm text-destructive">{operation.last_error}</p>}
    {operation.state === "ready" && hasReady && <div className="space-y-2 rounded-md border border-amber-600/60 bg-amber-500/10 p-2 text-xs">
      <p><b className="text-amber-400">Confirm write operation.</b> Review the evidence below. Applying updates derived encounter and ranking data and queues ratings work for each applied or no-op instance (queued is not completed). Original events remain untouched.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this report and confirm applying this repair.</label>
        <Button size="sm" disabled={!confirmed || busy} onClick={onApply} className="bg-amber-500 text-black hover:bg-amber-400">Apply repair</Button>
      </div>
    </div>}
    {(operation.state === "ready" || operation.state === "completed") && !hasReady && operation.applied === 0 && <p className="text-xs text-muted-foreground">No instances are eligible to apply. No action is required. Review the skip reasons below.</p>}
    <div className="styled-scrollbar max-h-[32rem] overflow-auto rounded border">
      <table className="w-full text-left text-xs"><caption className="sr-only">Instance evidence and outcomes</caption>
        <thead className="sticky top-0 bg-muted"><tr>{["Instance", "State", "Changes / reason", "Ratings"].map((title) => <th key={title} scope="col" className="px-2 py-1.5 font-medium">{title}</th>)}</tr></thead>
        <tbody>{items.map((item) => <tr key={item.instance_id} className="border-t align-top">
          <td className="w-72 break-all px-2 py-1.5 font-mono"><a href={`/instances/${encodeURIComponent(item.instance_id)}`} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:no-underline" title="Open instance in a new tab">{item.instance_id}</a></td>
          <td className="px-2 py-1.5"><StatePill state={item.state} /></td>
          <td className="px-2 py-1.5">
            <p className="break-words">{item.reason}</p>
            {(item.changes ?? []).length > 0 && <ul className="list-inside list-disc text-muted-foreground">{item.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>}
            <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">Evidence details{(item.warnings?.length ?? 0) > 0 && <span className="ml-2 text-amber-300">· warnings</span>}</summary>
              <div className="mt-2 space-y-2">
                {item.evidence_hash && <p className="text-muted-foreground">Evidence hash <code className="break-all">{item.evidence_hash}</code></p>}
                <RepairDetails operation={operation.operation} version={operation.version} warnings={item.warnings} details={item.details} />
              </div>
            </details>
          </td>
          <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{item.ratings_queued ? "Queued, not completed" : "Not queued"}</td>
        </tr>)}</tbody>
      </table>
      {!items.length && <p className="p-2 text-xs text-muted-foreground">No instance results yet.</p>}
    </div>
  </Card>;
}

export function AdminEventRepairs() {
  const client = useQueryClient();
  const tenants = useAdminTenants();
  const realms = useRealms();
  const [params, setParams] = useSearchParams();
  const selected = params.get("operation") || "";
  const [form, setForm] = useState<RepairSelection>({ operation: "razorgore-phase-two", mode: "single", instance: "", tenant: "", limit: "100", realm: "", after: "", before: "" });
  const [validationError, setValidationError] = useState("");
  const list = useQuery({
    queryKey: eventRepairKey,
    queryFn: () => repairRequest<AdminEventRepairList>(),
    retry: false,
    refetchInterval: (query) => query.state.status !== "error" && query.state.data?.operations?.some((operation) => isRepairActive(operation.state)) ? 3000 : false,
  });
  const detail = useQuery({
    queryKey: [...eventRepairKey, selected],
    queryFn: () => repairRequest<AdminEventRepairOperation>(`/${encodeURIComponent(selected)}`),
    enabled: !!selected,
    retry: false,
    refetchInterval: (query) => query.state.status !== "error" && isRepairActive(query.state.data?.state) ? 3000 : false,
  });
  const mutation = useMutation({
    mutationFn: ({ action, request, id }: { action: "create" | "apply" | "cancel" | "retry"; request?: AdminEventRepairCreateRequest; id?: string }) =>
      repairRequest<AdminEventRepairOperation>(action === "create" ? "" : `/${encodeURIComponent(id!)}/${action}`, action === "create" ? request : action),
    retry: false,
    onSuccess: (operation) => {
      client.setQueryData([...eventRepairKey, operation.id], operation);
      setParams((previous) => { previous.set("operation", operation.id); return previous; });
      void client.invalidateQueries({ queryKey: eventRepairKey });
    },
    onError: () => { void client.invalidateQueries({ queryKey: [...eventRepairKey, selected] }); },
  });
  function field(key: Exclude<keyof RepairSelection, "mode" | "operation">, label: string, type = "text", required = false, className = "") {
    return <label className={`${labelClass} ${className}`} key={key}><span>{label}</span><input className={inputClass} type={type} value={form[key]} required={required} aria-describedby={validationError ? "repair-form-error" : undefined} onChange={(event) => setForm({ ...form, [key]: event.target.value })} {...(key === "limit" ? { min: 1, max: 1000, step: 1 } : {})} /></label>;
  }
  return <div className="space-y-3">
    <header><h1 className="text-xl font-bold">Event repairs</h1><p className="text-xs text-muted-foreground">Dry-run first, review the evidence, then apply. Original events remain untouched. Operations are saved on the server and continue when you leave this page.</p></header>
    <Card className="gap-0 p-3"><form className="space-y-2" noValidate onSubmit={(event) => {
      event.preventDefault();
      mutation.reset();
      try { const request = buildRepairRequest(form); setValidationError(""); mutation.mutate({ action: "create", request }); }
      catch (error) { setValidationError(error instanceof Error ? error.message : "Invalid selection"); }
    }}>
      <h2 className="text-sm font-semibold">New dry-run</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${labelClass} w-56`}><span>Named repair</span><select className={inputClass} value={form.operation} onChange={(event) => { setForm({ ...form, operation: event.target.value }); setValidationError(""); }}><option value="razorgore-phase-two">Razorgore phase two · v1</option><option value="lucifron-ranked-damage">Lucifron ranked damage · v2</option></select></label>
        <fieldset className="text-xs text-muted-foreground"><legend className="mb-0.5">Selection</legend><div className="flex h-8 overflow-hidden rounded-md border border-input">{(["single", "sweep"] as const).map((mode) => <label key={mode} className={`flex cursor-pointer items-center gap-1.5 px-2 text-sm ${form.mode === mode ? "bg-primary/20 font-medium text-foreground" : "hover:bg-muted"}`}><input type="radio" className="sr-only" name="selection" value={mode} checked={form.mode === mode} onChange={() => { setForm({ ...form, mode }); setValidationError(""); }} />{mode === "single" ? "Single instance" : "Bounded tenant sweep"}</label>)}</div></fieldset>
        {form.mode === "single" && field("instance", "Instance URL, ID, or slug", "text", true, "min-w-64 flex-1")}
        <Button type="submit" size="sm" className="h-8" disabled={mutation.isPending}>{mutation.isPending ? "Submitting…" : "Start dry-run"}</Button>
      </div>
      {form.operation === "lucifron-ranked-damage" && <p className="text-xs text-muted-foreground">Recalculate ranked damage for Lucifron (12118) and Flamewaker Protector (12119). Core Hounds are excluded. Only instances parsed before v1.0.173 are eligible; v1.0.173 or later and unknown parser versions are skipped. Original events remain untouched.</p>}
      {form.mode === "sweep" && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_2fr_1fr_1fr]">
        <label className={labelClass}><span>Tenant (required)</span><select className={inputClass} value={form.tenant} required disabled={tenants.isPending || tenants.isError} onChange={(event) => setForm({ ...form, tenant: event.target.value, realm: "" })}>
          <option value="">{tenants.isPending ? "Loading tenants…" : tenants.isError ? "Tenants unavailable" : "Select a tenant"}</option>
          {[...(tenants.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug || tenant.id})</option>)}
        </select>{tenants.isError && <span role="alert" className="block text-destructive">Could not load tenants. <button type="button" className="underline" onClick={() => { void tenants.refetch(); }}>Retry tenants</button></span>}{tenants.isSuccess && !tenants.data.length && <span className="block">No tenants available.</span>}</label>
        {field("limit", "Max instances (1–1000)", "number", true)}
        <label className={labelClass}><span>Realm (optional)</span><select className={inputClass} value={form.realm} disabled={realms.isPending || realms.isError} onChange={(event) => setForm({ ...form, realm: event.target.value })}>
          <option value="">{realms.isPending ? "Loading realms…" : "All realms"}</option>
          {[...(realms.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((realm) => <option key={realm.id} value={realm.id}>{realm.name} ({realm.id})</option>)}
        </select>{realms.isError && <span role="alert" className="block text-destructive">Could not load realms. <button type="button" className="underline" onClick={() => { void realms.refetch(); }}>Retry realms</button></span>}{realms.isSuccess && !realms.data.length && <span className="block">No realm filters available.</span>}</label>{field("after", "After (UTC, optional)", "date")}{field("before", "Before (UTC, optional)", "date")}
      </div>}
      {validationError && <p id="repair-form-error" role="alert" className="text-sm text-destructive">{validationError}</p>}
    </form></Card>
    {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    <div className="grid items-start gap-3 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="min-w-0 gap-0 p-3"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Recent operations</h2><Button size="sm" variant="ghost" className="h-7" disabled={list.isFetching} onClick={() => { void list.refetch(); }}>Refresh</Button></div>
        {list.isLoading && <p role="status" className="text-xs">Loading operations…</p>}{list.error && <p role="alert" className="text-sm text-destructive">{list.error.message}</p>}
        <ul className="styled-scrollbar mt-2 max-h-[32rem] divide-y overflow-auto rounded border">{(list.data?.operations ?? []).map((operation) => <li key={operation.id}><button className={`w-full px-2 py-1.5 text-left text-xs hover:bg-muted ${selected === operation.id ? "bg-muted shadow-[inset_2px_0_0_var(--primary)]" : ""}`} aria-pressed={selected === operation.id} disabled={mutation.isPending} onClick={() => { mutation.reset(); setParams({ operation: operation.id }); }} title={operation.id}>
          <span className="flex items-center gap-2"><StatePill state={operation.state} /><span className="truncate font-medium">{operation.operation} · v{operation.version}</span><span className="ml-auto font-mono tabular-nums text-muted-foreground">{operation.processed}/{operation.total}</span></span>
          <span className="mt-0.5 flex justify-between gap-2 font-mono text-[11px] text-muted-foreground"><span>{operation.id.slice(0, 8)}</span><span>{when(operation.created_at)}</span></span>
        </button></li>)}</ul>{list.data && !list.data.operations?.length && <p className="text-xs text-muted-foreground">No repairs yet.</p>}
      </Card>
      <section className="min-w-0 space-y-3" aria-label="Selected operation">
        {!selected && <p className="p-3 text-sm text-muted-foreground">Start a dry-run or select a saved operation to inspect its report.</p>}
        {selected && detail.isLoading && <p role="status">Loading report…</p>}
        {detail.error && <div role="alert" className="text-sm text-destructive">{detail.error.message}<Button variant="outline" size="sm" className="ml-2" onClick={() => { void detail.refetch(); }}>Reload report</Button></div>}
        {detail.data && <RepairReport key={`${detail.data.id}:${detail.data.state}:${detail.data.updated_at}`} operation={detail.data} busy={mutation.isPending || detail.isFetching || detail.isError} onApply={() => mutation.mutate({ action: "apply", id: selected })} onCancel={() => mutation.mutate({ action: "cancel", id: selected })} onRetry={() => mutation.mutate({ action: "retry", id: selected })} />}
      </section>
    </div>
  </div>;
}
