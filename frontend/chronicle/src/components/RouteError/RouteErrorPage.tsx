import { useState } from "react";
import { useRouteError } from "react-router-dom";
import { Copy, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createErrorReport, downloadErrorReport } from "@/lib/errorReport";

// This fallback deliberately needs no application providers or API requests.
export function RouteErrorPage() {
  const error = useRouteError();
  const [report] = useState(() => JSON.stringify(createErrorReport(error), null, 2));
  const [status, setStatus] = useState("");

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setStatus("Report copied. Paste it into your message to the Chronicle team.");
    } catch {
      setStatus("Could not copy the report. Download it instead, or select the report text below.");
    }
  }

  function downloadReport() {
    try {
      downloadErrorReport(report);
      setStatus("Report download started. Attach the file to your message to the Chronicle team.");
    } catch {
      setStatus("Could not download the report. Try copying it, or select the report text below.");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12 text-foreground" translate="no">
      <div className="w-full max-w-2xl">
        <a href="/" className="text-xs font-semibold tracking-[0.22em] text-muted-foreground hover:text-foreground">CHRONICLE</a>
        <section aria-labelledby="error-heading" className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="h-1 bg-amber-500/70" />
          <div className="p-6 sm:p-10">
            <div className="mb-6 flex size-12 items-center justify-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-500">
              <TriangleAlert className="size-6" aria-hidden="true" />
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Something went wrong</p>
            <h1 id="error-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">This page hit a snag.</h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Chronicle couldn’t display this page. Try reloading it. If it happens again, send us an error report so we can investigate.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button onClick={() => window.location.reload()}><RefreshCw aria-hidden="true" />Reload page</Button>
              <Button variant="ghost" asChild><a href="/">Go to homepage</a></Button>
            </div>
            <div className="mt-8 border-t border-border pt-6">
              <h2 className="text-sm font-semibold">Help us track it down</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Copy or download the report and send it to the Chronicle team, along with what you were doing when this happened. Nothing is sent automatically.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => void copyReport()}><Copy aria-hidden="true" />Copy report</Button>
                <Button variant="outline" onClick={downloadReport}><Download aria-hidden="true" />Download report</Button>
              </div>
              <p role="status" className="mt-3 text-sm text-muted-foreground">{status}</p>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Review technical report</summary>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Includes the error, page path, build version, and browser details. Cookies and browser storage are not collected. URL query values and fragments are omitted. Review error text for private details before sharing.
                </p>
                <pre tabIndex={0} aria-label="Technical error report" className="styled-scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background p-4 text-xs leading-relaxed text-muted-foreground">{report}</pre>
              </details>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
