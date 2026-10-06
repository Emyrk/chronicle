import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DuplicateInstanceModal, type DuplicateModalInstance } from "./DuplicateInstanceModal";

function instance(overrides: Partial<DuplicateModalInstance> = {}): DuplicateModalInstance {
  return {
    id: "instance-id",
    slug: "instance-slug",
    name: "Molten Core",
    recorder_name: "Recorder",
    uploader_name: "Uploader",
    player_count: 40,
    duration_ms: 3600000,
    ...overrides,
  };
}

describe("DuplicateInstanceModal", () => {
  it("renders every instance as a link so browser new-tab actions work", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DuplicateInstanceModal
          instances={[
            instance(),
            instance({ id: "fallback-id", slug: "" }),
          ]}
          currentInstanceId="instance-id"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/instances/instance-slug"');
    expect(markup).toContain('href="/instances/fallback-id"');
  });
});
