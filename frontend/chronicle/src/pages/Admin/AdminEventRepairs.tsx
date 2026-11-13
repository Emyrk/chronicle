import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { buildRepairRequest, eventRepairKey, isRepairActive, repairRequest } from "@/api/eventRepairs";
import type { AdminEventRepairCreateRequest, AdminEventRepairList, AdminEventRepairOperation, RepairSelection } from "@/api/eventRepairs";

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function RepairReport({ operation, busy, onApply, onCancel, onRetry }: {
  operation: AdminEventRepairOperation;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
  onRetry?: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return <Card className="space-y-4 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Repair report</h2><p className="break-all font-mono text-xs text-muted-foreground">{operation.id}</p></div>
      <p role="status" className="rounded border px-2 py-1 text-sm">{operation.state.replaceAll("_", " ")}</p>
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      {[["Processed", `${operation.processed} / ${operation.total}`], ["Applied", operation.applied], ["Skipped", operation.skipped], ["Version", `v${operation.version}`]].map(([label, value]) =>
        <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-mono text-lg tabular-nums">{value}</dd></div>)}
    </dl>
    <div className="break-all text-xs text-muted-foreground">
      <p>{operation.operation} · Tenant: {operation.tenant_id}</p>
      <p>Created {operation.created_at} by {operation.created_by}</p><p>Updated {operation.updated_at}</p>
    </div>
    <details className="text-xs"><summary className="cursor-pointer">Saved selection</summary><pre className="styled-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(operation.selection, null, 2)}</pre></details>
    {operation.last_error && <p role="alert" className="break-words text-sm text-destructive">{operation.last_error}</p>}
    {operation.state === "ready" && <div className="space-y-3 rounded-md border border-amber-600/60 bg-amber-500/10 p-3 text-sm">
      <h3 className="font-semibold text-amber-400">Confirm write operation</h3>
      <p>Review the dry-run evidence below. Apply updates derived encounter and ranking evidence. Original events remain untouched.</p>
      <p>Every successfully applied or no-op instance enqueues ratings work. Ratings queued does not mean ratings completed.</p>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed this report and confirm applying this repair.</label>
      <Button disabled={!confirmed || busy} onClick={onApply} className="bg-amber-500 text-black hover:bg-amber-400">Apply repair</Button>
    </div>}
    {isRepairActive(operation.state) && operation.last_error && onRetry && <Button variant="outline" disabled={busy} onClick={onRetry}>Retry operation</Button>}
    {isRepairActive(operation.state) && <Button variant="outline" disabled={busy} onClick={onCancel}>Cancel operation</Button>}
    <div className="styled-scrollbar max-h-[32rem] overflow-auto rounded border">
      <table className="w-full text-left text-xs"><caption className="p-3 text-left text-sm font-medium">Instance evidence and outcomes</caption>
        <thead className="bg-muted"><tr>{["Instance", "State", "Changes / reason", "Ratings"].map((title) => <th key={title} scope="col" className="p-3">{title}</th>)}</tr></thead>
        <tbody>{(operation.items ?? []).map((item) => <tr key={item.instance_id} className="border-t align-top">
          <td className="max-w-56 break-all p-3 font-mono">{item.instance_id}</td><td className="p-3">{item.state}</td>
          <td className="min-w-60 p-3"><p className="break-words">{item.reason}</p><ul className="list-inside list-disc">{(item.changes ?? []).map((change, index) => <li key={index}>{change}</li>)}</ul>{item.evidence_hash && <details className="mt-2 text-muted-foreground"><summary className="cursor-pointer">Evidence hash</summary><code className="break-all">{item.evidence_hash}</code></details>}</td>
          <td className="p-3">{item.ratings_queued ? "Queued, not completed" : "Not queued"}</td>
        </tr>)}</tbody>
      </table>
      {!operation.items?.length && <p className="p-3 text-sm text-muted-foreground">No instance results yet.</p>}
    </div>
  </Card>;
}

export function AdminEventRepairs() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get("operation") || "";
  const [form, setForm] = useState<RepairSelection>({ mode: "single", instance: "", tenant: "", limit: "100", realm: "", after: "", before: "" });
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
  function field(key: Exclude<keyof RepairSelection, "mode">, label: string, type = "text", required = false) {
    return <label className="space-y-1 text-sm" key={key}><span>{label}</span><input className={inputClass} type={type} value={form[key]} required={required} aria-describedby={validationError ? "repair-form-error" : undefined} onChange={(event) => setForm({ ...form, [key]: event.target.value })} {...(key === "limit" ? { min: 1, max: 1000, step: 1 } : {})} /></label>;
  }
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-bold">Event repairs</h1><p className="mt-1 text-sm text-muted-foreground">Dry-run first. Review evidence before writing. Original events remain untouched.</p><p className="mt-1 text-xs text-muted-foreground">Operations are saved on the server and continue when you leave this page.</p></header>
    <Card className="p-4"><form className="space-y-4" noValidate onSubmit={(event) => {
      event.preventDefault();
      mutation.reset();
      try { const request = buildRepairRequest(form); setValidationError(""); mutation.mutate({ action: "create", request }); }
      catch (error) { setValidationError(error instanceof Error ? error.message : "Invalid selection"); }
    }}>
      <h2 className="font-semibold">New dry-run</h2>
      <label className="block space-y-1 text-sm"><span>Named repair</span><select className={inputClass} value="razorgore-phase-two" onChange={() => {}}><option value="razorgore-phase-two">Razorgore phase two · v1</option></select></label>
      <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="mb-2">Selection</legend>{(["single", "sweep"] as const).map((mode) => <label key={mode} className="flex items-center gap-2"><input type="radio" name="selection" value={mode} checked={form.mode === mode} onChange={() => { setForm({ ...form, mode }); setValidationError(""); }} />{mode === "single" ? "Single instance" : "Bounded tenant sweep"}</label>)}</fieldset>
      {form.mode === "single" ? field("instance", "Instance URL, ID, or slug", "text", true) : <div className="grid gap-3 sm:grid-cols-2">
        {field("tenant", "Tenant UUID (required)", "text", true)}{field("limit", "Maximum instances (1–1000)", "number", true)}
        {field("realm", "Realm UUID (optional)")}{field("after", "After (UTC, optional)", "date")}{field("before", "Before (UTC, optional)", "date")}
      </div>}
      {validationError && <p id="repair-form-error" role="alert" className="text-sm text-destructive">{validationError}</p>}
      <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Submitting…" : "Start dry-run"}</Button>
    </form></Card>
    {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="min-w-0 p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Recent operations</h2><Button size="sm" variant="ghost" disabled={list.isFetching} onClick={() => { void list.refetch(); }}>Refresh</Button></div>
        {list.isLoading && <p role="status">Loading operations…</p>}{list.error && <p role="alert" className="text-sm text-destructive">{list.error.message}</p>}
        <ul className="styled-scrollbar mt-3 max-h-[32rem] space-y-2 overflow-auto">{(list.data?.operations ?? []).map((operation) => <li key={operation.id}><button className={`w-full rounded border p-3 text-left text-xs hover:bg-muted ${selected === operation.id ? "border-primary bg-muted" : "border-border"}`} aria-pressed={selected === operation.id} disabled={mutation.isPending} onClick={() => { mutation.reset(); setParams({ operation: operation.id }); }}>
          <span className="block font-medium">{operation.operation} · v{operation.version}</span><span className="mt-1 block">{operation.state.replaceAll("_", " ")} · {operation.processed}/{operation.total}</span><span className="mt-1 block break-all font-mono text-muted-foreground">{operation.id}</span><span className="block text-muted-foreground">{operation.created_at}</span>
        </button></li>)}</ul>{list.data && !list.data.operations?.length && <p className="text-sm text-muted-foreground">No repairs yet.</p>}
      </Card>
      <section className="min-w-0 space-y-3" aria-label="Selected operation">
        {!selected && <p className="p-4 text-sm text-muted-foreground">Start a dry-run or select a saved operation to inspect its report.</p>}
        {selected && detail.isLoading && <p role="status">Loading report…</p>}
        {detail.error && <div role="alert" className="text-sm text-destructive">{detail.error.message}<Button variant="outline" size="sm" className="ml-2" onClick={() => { void detail.refetch(); }}>Reload report</Button></div>}
        {detail.data && <RepairReport key={`${detail.data.id}:${detail.data.state}:${detail.data.updated_at}`} operation={detail.data} busy={mutation.isPending || detail.isFetching || detail.isError} onApply={() => mutation.mutate({ action: "apply", id: selected })} onCancel={() => mutation.mutate({ action: "cancel", id: selected })} onRetry={() => mutation.mutate({ action: "retry", id: selected })} />}
      </section>
    </div>
    <p className="text-xs text-muted-foreground">Every successfully applied or no-op instance enqueues ratings work. Ratings queued is not ratings completed.</p>
  </div>;
}
