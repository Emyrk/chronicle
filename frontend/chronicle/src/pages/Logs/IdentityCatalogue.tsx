import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IdentityCatalogueRecord, IdentityCatalogueResponse } from "@/api/typesGenerated";
import { fetchIdentityCatalogue, identityCatalogueDownloadURL, type CatalogueCursor, type CatalogueReview } from "@/api/identityCatalogue";

const button = "rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";

/** Fail closed before mounting the query: raw-log download permission is insufficient. */
export function IdentityCatalogue({ logId, hasAdminLogs = false }: { logId: string; hasAdminLogs?: boolean }) {
  if (!hasAdminLogs) return null;
  return <CatalogueQuery key={logId} logId={logId} />;
}

function CatalogueQuery({ logId }: { logId: string }) {
  const [review, setReview] = useState<CatalogueReview>("unknown");
  const [cursors, setCursors] = useState<CatalogueCursor[]>([]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ["identityCatalogue", logId, review, cursor],
    queryFn: ({ signal }) => fetchIdentityCatalogue(logId, review, cursor, signal),
    retry: false,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const page = query.data?.page;
  const reset = query.data?.reset ?? false;
  return <IdentityCatalogueView logId={logId} review={review} page={page} loading={query.isFetching} error={query.error?.message} reset={reset}
    pageNumber={reset ? 1 : cursors.length + 1} canPrevious={!reset && cursors.length > 0}
    onReview={(next) => { setReview(next); setCursors([]); }}
    onRefresh={() => { if (cursor) setCursors([]); else void query.refetch(); }}
    onPrevious={() => setCursors(cursors.slice(0, -1))}
    onNext={() => { if (page?.next_after && page.catalogue) setCursors([...(reset ? [] : cursors), { after: page.next_after, generation: page.catalogue.generation }]); }} />;
}

interface CatalogueViewProps {
  logId: string;
  review: CatalogueReview;
  page?: IdentityCatalogueResponse;
  loading: boolean;
  error?: string;
  reset?: boolean;
  pageNumber: number;
  canPrevious: boolean;
  onReview: (review: CatalogueReview) => void;
  onRefresh: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function IdentityCatalogueView({ logId, review, page, loading, error, reset, pageNumber, canPrevious, onReview, onRefresh, onPrevious, onNext }: CatalogueViewProps) {
  const header = page?.catalogue;
  const records = page?.records ?? [];
  return <section aria-label="Identity catalogue" className="min-w-0 space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Identity catalogue</h2><p className="text-xs text-muted-foreground">Admin review · one record per GUID, including the zero sentinel. Collected by both parser engines without verbose mode.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={loading} onClick={onRefresh}>Refresh catalogue</button>
        {header && !error && !loading && <a className={button} href={identityCatalogueDownloadURL(logId, header.generation)} download>Download full JSON</a>}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2" aria-label="Catalogue review filters">
      {([["unknown", "Unresolved"], ["conflicts", "Conflicts"], ["all", "All GUIDs"]] as const).map(([value, label]) => <button key={value} className={button} aria-pressed={review === value} onClick={() => onReview(value)}>{label}</button>)}
    </div>
    {loading ? <p role="status">Loading identity catalogue…</p> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : page && !header ? <p className="text-sm text-muted-foreground">No catalogue has been saved for this log. Reparse with either engine to populate it; verbose mode is not required.</p> : header && page ? <>
      {reset && <p role="status" className="text-sm">The catalogue was replaced by a newer parse. Returned to the first page; previous results were discarded.</p>}
      <p className="text-xs text-muted-foreground">{header.guid_count} GUIDs · {header.event_count} events · {header.zero_guid_count} zero-GUID observations · generation {header.generation} · saved <time dateTime={header.created_at}>{header.created_at}</time></p>
      <details className="text-xs"><summary className="cursor-pointer">Catalogue provenance</summary><dl className="mt-2 grid gap-1 break-all sm:grid-cols-2">
        <div>Engine: {header.parser_engine}</div><div>Build: {header.parser_build}</div>
        <div>Format: {header.format}</div><div>Flavor: {header.flavor}</div>
        <div>Dataset: {header.dataset_id} · revision {header.dataset_revision}</div>
        <div>Catalogue v{header.catalogue_version} · rules v{header.rule_version}</div>
      </dl></details>
      {records.length === 0 ? <p className="text-sm">No GUIDs match this filter. Use All GUIDs to browse the complete catalogue.</p> : <div className="styled-scrollbar max-w-full overflow-x-auto">
        <table className="w-full text-left text-xs"><thead><tr className="border-b">{["GUID / names", "Entry", "Kind", "Category", "Affiliation", "Recognition", "Evidence"].map((label) => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{records.map((record) => <CatalogueRow key={`${header.generation}:${record.guid}`} record={record} />)}</tbody>
        </table>
      </div>}
      <div className="flex flex-wrap items-center gap-2"><button className={button} disabled={!canPrevious} onClick={onPrevious}>Previous page</button><span className="text-xs">Page {pageNumber} · {records.length} records</span><button className={button} disabled={!page.next_after} onClick={onNext}>Next page</button></div>
    </> : null}
  </section>;
}

function CatalogueRow({ record }: { record: IdentityCatalogueRecord }) {
  const [open, setOpen] = useState(false);
  const evidence = record.evidence ?? [];
  const names = [...new Set(evidence.filter((item) => item.name).map((item) => item.name))].slice(0, 3);
  return <tr className="border-b align-top">
    <td className="p-2"><span className="font-mono">{record.guid}</span>{names.map((name) => <p key={name} className="max-w-56 break-words">{name}</p>)}</td>
    <td className="p-2">{record.entry}</td><td className="p-2">{record.kind}</td><td className="p-2">{record.category}</td><td className="p-2">{record.affiliation}</td>
    <td className="p-2">{record.recognition}{record.unknown && <p>Unresolved</p>}{record.conflict && <p className="text-destructive">Conflict</p>}</td>
    <td className="p-2"><details onToggle={(event) => setOpen(event.currentTarget.open)}><summary className="cursor-pointer whitespace-nowrap">Evidence ({evidence.length})</summary>{open && <CatalogueEvidence record={record} />}</details></td>
  </tr>;
}

export function CatalogueEvidence({ record }: { record: IdentityCatalogueRecord }) {
  const [page, setPage] = useState(0);
  const [contextPage, setContextPage] = useState(0);
  const evidence = record.evidence ?? [];
  const contexts = record.contexts ?? [];
  return <div className="w-80 max-w-[80vw] space-y-3 py-2">
    <p>{record.observations} observations · {record.first_seen} — {record.last_seen}</p>
    <p>Roles describe source/target/name/owner evidence; affiliation and category are independent.</p>
    {record.evidence_truncations > 0 && <p className="text-amber-500">{record.evidence_truncations} evidence fields were truncated during collection. The download contains the retained data, not the discarded detail.</p>}
    {record.evidence_overflow > 0 && <p className="text-amber-500">{record.evidence_overflow} additional evidence observations exceeded the retained evidence limit.</p>}
    <ol className="space-y-2">{evidence.slice(page * 20, (page + 1) * 20).map((item, i) => <li key={i} className="break-all rounded bg-muted/40 p-2">
      <strong>{item.role}</strong> · {item.observations} observations
      {item.name && <p>Name: {item.name}</p>}{item.related_guid && <p>Related GUID: {item.related_guid}</p>}{item.spell_id !== undefined && <p>Spell: {item.spell_id}</p>}
      <p>{item.first_seen} — {item.last_seen}</p>
    </li>)}</ol>
    <EvidencePager page={page} count={evidence.length} onPage={setPage} />
    <h3 className="font-medium">Observed contexts</h3>
    <ul className="space-y-2">{contexts.slice(contextPage * 20, (contextPage + 1) * 20).map((context, i) => <li key={i} className="break-words rounded bg-muted/40 p-2">
      {context.zone || "Unknown zone"} · map {context.map_id} · instance {context.instance_id}
      <p>{context.category} · {context.affiliation} · {context.recognition}</p><p>{context.observations} observations · {context.first_seen} — {context.last_seen}</p>
    </li>)}</ul>
    <EvidencePager page={contextPage} count={contexts.length} onPage={setContextPage} />
  </div>;
}

function EvidencePager({ page, count, onPage }: { page: number; count: number; onPage: (page: number) => void }) {
  if (count <= 20) return null;
  return <div className="flex items-center gap-2"><button className={button} disabled={page === 0} onClick={() => onPage(page - 1)}>Previous 20</button><span>{page * 20 + 1}–{Math.min(count, (page + 1) * 20)} of {count}</span><button className={button} disabled={(page + 1) * 20 >= count} onClick={() => onPage(page + 1)}>Next 20</button></div>;
}
