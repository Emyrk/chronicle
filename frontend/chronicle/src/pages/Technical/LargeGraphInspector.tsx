import { isSemanticObject, objectRelations } from "./semanticGraph";
import { useMemo, useState } from "react";
import type { GraphIndex, StateGraphIssue } from "./stateGraph";
import { GRAPH_PAGE_SIZE, metadataPreview, searchGraphNodes } from "./largeGraph";

const button = "rounded border border-input px-2 py-1 text-xs disabled:opacity-50 hover:bg-muted";

export function LargeGraphInspector({ index, issues = [], selected, onSelect }: { index: GraphIndex; issues?: StateGraphIssue[]; selected?: string; onSelect: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [raw, setRaw] = useState(false);
  const objects = useMemo(() => index.graph.nodes.filter(isSemanticObject), [index]);
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const matches = useMemo(() => searchGraphNodes(raw ? index.graph.nodes : objects, query), [index, objects, raw, query]);
  const path = selected ?? objects[0]?.path ?? index.graph.root;
  const node = index.byPath.get(path);
  const relations = useMemo(() => objectRelations(index, path), [index, path]);
  const preview = useMemo(() => metadataPreview(node?.metadata), [node]);
  const follow = (next: string) => {
    setHistory((previous) => [...previous.slice(-99), path]);
    onSelect(next);
  };

  return (
    <section aria-label="Bounded graph inspector" className="space-y-3">
      <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
        Large graph: safe inspection mode. Whole-graph layout and recursive dependency-cycle diagnostics are deferred. Structural, path and reference checks remain active.
        {objects.length.toLocaleString()} high-level objects; {(index.graph.nodes.length - objects.length).toLocaleString()} implementation objects and reference slots hidden by default. Lists show at most {GRAPH_PAGE_SIZE} at a time.
      </p>
      {issues.length > 0 && <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">Validation issues ({issues.length}; first 50 shown)</summary>
        <ul>{issues.slice(0, 50).map((issue, i) => <li key={i} className="break-all">{issue.path}: {issue.message}</li>)}</ul>
      </details>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-2 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={raw} onChange={(event) => { setRaw(event.target.checked); setPage(0); }} />
            Raw nodes (include implementation details and reference slots)
          </label>
          <label className="block text-sm">Search {raw ? "all nodes" : "high-level objects"} by path or type
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} className="mt-1 w-full rounded border bg-background p-2" />
          </label>
          <Pager page={page} count={matches.length} onPage={setPage} />
          <ul className="styled-scrollbar max-h-[32rem] overflow-auto text-xs">
            {matches.slice(page * GRAPH_PAGE_SIZE, (page + 1) * GRAPH_PAGE_SIZE).map((entry) => (
              <li key={entry.path} className="border-b py-2">
                <button className="break-all text-left underline" onClick={() => follow(entry.path)}>{raw ? entry.path : entry.type ?? entry.path}</button>
                <p className="break-all text-muted-foreground">{raw ? `${entry.kind} · ${entry.type ?? ""}` : entry.path}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 space-y-3 rounded-md border p-3">
          <button className={button} disabled={!history.length} onClick={() => { const prior = history.at(-1); if (prior) { setHistory(history.slice(0, -1)); onSelect(prior); } }}>Back to previous node</button>
          <h2 className="break-all font-mono text-sm">{path}</h2>
          {!node ? <p>Node not found. Search for another path.</p> : <>
            <p className="break-all text-xs text-muted-foreground">{node.kind} · {node.type}</p>
            {node.target && <button className={`${button} max-w-full break-all text-left`} onClick={() => follow(node.target!)}>Follow reference: {node.target}</button>}
            {!raw && <>
              <Adjacency key={`${path}:objects`} title="Related objects" paths={relations.highLevel} index={index} onSelect={follow} />
              <Adjacency key={`${path}:internal`} title="Period and implementation state" paths={relations.implementation} index={index} onSelect={follow} />
              <Adjacency key={`${path}:owners`} title="Referenced by objects" paths={relations.owners} index={index} onSelect={follow} />
            </>}
            {raw && <>
            <Adjacency key={`${path}:children`} title="Children" paths={index.children.get(path) ?? []} onSelect={follow} />
            <Adjacency key={`${path}:references`} title="Referenced by" paths={index.referencesTo.get(path) ?? []} onSelect={follow} />
            </>}
            <Adjacency key={`${path}:dependencies`} title="Depends on" paths={index.depsFrom.get(path) ?? []} onSelect={follow} />
            <Adjacency key={`${path}:dependents`} title="Dependents" paths={index.depsTo.get(path) ?? []} onSelect={follow} />
            <details>
              <summary className="cursor-pointer text-sm">Bounded metadata preview</summary>
              <p className="my-2 text-xs text-muted-foreground">Preview only: up to 4 levels, 20 entries per collection and 16,000 characters. Use the original download for full metadata.</p>
              <pre className="styled-scrollbar max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{preview}</pre>
            </details>
          </>}
        </div>
      </div>
    </section>
  );
}

function Pager({ page, count, onPage }: { page: number; count: number; onPage: (page: number) => void }) {
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <button className={button} disabled={page === 0} onClick={() => onPage(page - 1)}>Previous page</button>
    <span>{count === 0 ? 0 : page * GRAPH_PAGE_SIZE + 1}–{Math.min(count, (page + 1) * GRAPH_PAGE_SIZE)} of {count}</span>
    <button className={button} disabled={(page + 1) * GRAPH_PAGE_SIZE >= count} onClick={() => onPage(page + 1)}>Next page</button>
  </div>;
}

function Adjacency({ title, paths, index, onSelect }: { title: string; paths: string[]; index?: GraphIndex; onSelect: (path: string) => void }) {
  const [page, setPage] = useState(0);
  if (!paths.length) return null;
  return <details>
    <summary className="cursor-pointer text-sm">{title} ({paths.length})</summary>
    <Pager page={page} count={paths.length} onPage={setPage} />
    <ul className="styled-scrollbar max-h-48 overflow-auto">
      {paths.slice(page * GRAPH_PAGE_SIZE, (page + 1) * GRAPH_PAGE_SIZE).map((path, i) => <li key={`${path}:${i}`}><button className="break-all text-left text-xs underline" onClick={() => onSelect(path)}>{index ? `${index.byPath.get(path)?.type ?? "Object"} · ${path}` : path}</button></li>)}
    </ul>
  </details>;
}
