import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import workerSource from "./isolationProbe.worker.js?raw";
import { isolationExitURL, isolationTestEnabled, verifyIsolationProbe } from "./isolationProbe";

export function IsolationDiagnostic() {
  const { search } = useLocation();
  return isolationTestEnabled(search) ? <IsolationProbe /> : null;
}

function IsolationProbe() {
  const [result, setResult] = useState("Pending dedicated module-worker probe...");
  const secure = window.isSecureContext;
  const isolated = window.crossOriginIsolated;
  const available = typeof SharedArrayBuffer !== "undefined";

  useEffect(() => {
    if (!available) return;
    let worker: Worker | undefined;
    let objectURL: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const cleanup = () => {
      worker?.terminate();
      if (objectURL) URL.revokeObjectURL(objectURL);
      if (timer) clearTimeout(timer);
    };
    const finish = (message: string) => {
      if (done) return;
      done = true;
      cleanup();
      setResult(message);
    };
    try {
      const buffer = new SharedArrayBuffer(4);
      const view = new Int32Array(buffer);
      Atomics.store(view, 0, 41);
      objectURL = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
      worker = new Worker(objectURL, { type: "module", name: "isolation-compatibility-probe" });
      worker.onmessage = ({ data }: MessageEvent<unknown>) => {
        try {
          const workerIsolated = verifyIsolationProbe(data, view);
          finish(`Shared memory mutation verified (41 → 42). Worker crossOriginIsolated: ${workerIsolated}.`);
        } catch (error) {
          finish(`Probe failed: ${String(error)}`);
        }
      };
      worker.onerror = (event) => finish(`Worker error: ${event.message || "See browser console"}`);
      worker.onmessageerror = () => finish("Worker message could not be decoded.");
      timer = setTimeout(() => finish("Probe timed out after 5 seconds."), 5000);
      // SharedArrayBuffer is shared via structured clone, never transferred.
      worker.postMessage(buffer);
    } catch (error) {
      finish(`Probe failed: ${String(error)}`);
    }
    return () => { done = true; cleanup(); };
  }, [available]);

  return (
    <section aria-label="Cross-origin isolation diagnostic" className="m-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-3">
      <h2 className="font-semibold">Cross-origin isolation compatibility experiment</h2>
      <p>Unlisted, not private. This query flag is not access control. No aggregation or event-stream sharing changes are enabled.</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
        <div><dt>Secure context</dt><dd>{String(secure)}</dd></div>
        <div><dt>window.crossOriginIsolated</dt><dd>{String(isolated)}</dd></div>
        <div><dt>SharedArrayBuffer available</dt><dd>{String(available)}</dd></div>
      </dl>
      <p role="status">{available ? result : "Probe unavailable: SharedArrayBuffer is not exposed."}</p>
      {!isolated && <p className="font-medium">Isolation is not active. SPA navigation cannot apply document headers. Reload the full document with the flag; if it still fails, check HTTPS, response headers, and browser support.</p>}
      <p>Ads, YouTube, assets, and popouts are unchanged in code, but COEP may block third-party resources and COOP may sever opener access. Exercise them and inspect the browser console/network for blocked requests. A passing probe does not prove those integrations work.</p>
      <div className="flex flex-wrap gap-4">
        <button type="button" className="underline" onClick={() => window.location.reload()}>Reload full document</button>
        <button type="button" className="underline" onClick={() => window.location.assign(isolationExitURL(window.location.href))}>Exit experiment (full reload)</button>
      </div>
    </section>
  );
}
