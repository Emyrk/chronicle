import { afterEach, describe, expect, it, vi } from "vitest";
import { createErrorReport, describeRouteError, downloadErrorReport, reportPageURL } from "./errorReport";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("error reports", () => {
  it("removes query values, fragments and URL credentials", () => {
    expect(reportPageURL("https://user:password@capy.chronicleclassic.com/instances/abc?token=secret&panel=damage#private"))
      .toBe("https://capy.chronicleclassic.com/instances/abc");
  });

  it("preserves DOM error names and minified stack locations", () => {
    const error = new Error("Failed to execute 'removeChild' on 'Node'");
    error.name = "NotFoundError";
    error.stack = "NotFoundError: removeChild\n at il (https://capy.chronicleclassic.com/assets/index.js:12:98405)";
    expect(describeRouteError(error)).toEqual({ name: error.name, message: error.message, stack: error.stack });
    expect(describeRouteError(new DOMException("Missing child", "NotFoundError")).name).toBe("NotFoundError");
  });

  it("redacts URLs inside error messages and stacks", () => {
    const error = new Error("Failed to load https://example.com/page?token=secret#private");
    const result = describeRouteError(error);
    expect(result.message).toBe("Failed to load https://example.com/page");
    expect(result.stack).not.toContain("secret");
    expect(result.stack).not.toContain("#private");
  });

  it("handles route responses without copying their private bodies", () => {
    expect(describeRouteError({ status: 403, statusText: "Forbidden", internal: false, data: { private: "secret" } }))
      .toEqual({ name: "RouteResponseError", message: "HTTP 403" });
  });

  it("handles unknown and circular thrown values without serialization errors", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    for (const value of [null, undefined, 123, circular]) {
      expect(describeRouteError(value).name).toBe("UnknownError");
    }
    expect(describeRouteError("Something failed").message).toBe("Something failed");
  });

  it("captures build, page, browser and timestamp without reading browser storage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    vi.stubGlobal("window", { location: { href: "https://capy.chronicleclassic.com/instances/abc?token=secret#private" }, innerWidth: 1280, innerHeight: 720 });
    vi.stubGlobal("navigator", { userAgent: "test-browser", language: "en-US", onLine: true });
    const metadata: Record<string, string> = { GitCommit: "abc123", GitTag: "v1.2", BuildTime: "2026-01-01" };
    vi.stubGlobal("document", { querySelector: (selector: string) => ({ content: metadata[selector.split('"')[1]] }) });
    expect(createErrorReport("Oops")).toMatchObject({
      schemaVersion: 1,
      capturedAt: "2026-01-02T03:04:05.000Z",
      page: "https://capy.chronicleclassic.com/instances/abc",
      build: { commit: "abc123", tag: "v1.2", builtAt: "2026-01-01" },
      browser: { userAgent: "test-browser", language: "en-US", online: true, viewport: { width: 1280, height: 720 } },
    });
    vi.stubGlobal("document", { querySelector: () => ({ content: "{{ .GitCommit }}" }) });
    expect(createErrorReport(null).build.commit).toBeNull();
    vi.stubGlobal("document", { querySelector: () => null });
    expect(createErrorReport(null).build.commit).toBeNull();
  });

  it.each([false, true])("cleans up downloads, including when click fails (%s)", (fail) => {
    vi.useFakeTimers();
    const link = { href: "", download: "", click: vi.fn(() => { if (fail) throw new Error("Download blocked"); }), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
    const createURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report");
    const revokeURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    if (fail) expect(() => downloadErrorReport('{"error":"Oops"}')).toThrow("Download blocked");
    else downloadErrorReport('{"error":"Oops"}');
    expect(createURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(link.download).toBe("chronicle-error-report.json");
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(revokeURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeURL).toHaveBeenCalledWith("blob:report");
  });
});
