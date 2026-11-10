import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StorageSettingsView } from "./index";

function renderStorageSettings(autoDelete: boolean) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <StorageSettingsView
        storage={undefined}
        storageLoading
        logs={undefined}
        logsLoading
        currentTenantName={null}
        autoDeleteRawLogsAtStorageCapacity={autoDelete}
      />
    </QueryClientProvider>,
  );
}

describe("StorageSettingsView", () => {
  it("explains automatic cleanup and renders the saved enabled state", () => {
    const markup = renderStorageSettings(true);

    expect(markup).toContain("Automatically prevent storage from filling up");
    expect(markup).toContain("oldest unpinned raw files");
    expect(markup).toContain('aria-checked="true"');
  });

  it("renders the saved disabled state", () => {
    expect(renderStorageSettings(false)).toContain('aria-checked="false"');
  });
});
