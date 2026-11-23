import { isRouteErrorResponse } from "react-router-dom";

// Do not copy query values or fragments, which can contain credentials or private text.
export function reportPageURL(href: string): string {
  const url = new URL(href);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href;
}

function redactURLs(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"']+/g, (url) => {
    try {
      return reportPageURL(url);
    } catch {
      return "[invalid URL]";
    }
  });
}

export function describeRouteError(error: unknown): { name: string; message: string; stack?: string } {
  if (isRouteErrorResponse(error)) {
    // Response bodies can contain private data. Only include the HTTP status.
    return { name: "RouteResponseError", message: `HTTP ${error.status}` };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactURLs(error.message),
      stack: error.stack ? redactURLs(error.stack) : undefined,
    };
  }
  return {
    name: "UnknownError",
    message: typeof error === "string" ? redactURLs(error) : "An unexpected error occurred (no error details available).",
  };
}

export function createErrorReport(error: unknown) {
  const metadata = (name: string) => {
    const value = document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`)?.content;
    // Development HTML may still contain unrendered Go template placeholders.
    return value && !value.includes("{{") ? value : null;
  };
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    page: reportPageURL(window.location.href),
    error: describeRouteError(error),
    build: { commit: metadata("GitCommit"), tag: metadata("GitTag"), builtAt: metadata("BuildTime") },
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    privacy: "URL query values and fragments are omitted. Cookies and browser storage are not collected. Error text may contain page-specific details; review before sharing.",
  };
}

export function downloadErrorReport(report: string): void {
  const url = URL.createObjectURL(new Blob([report], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "chronicle-error-report.json";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Keep the URL alive until the browser has started consuming the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
