import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAdminOutdatedInstances,
  useBulkReparseOutdatedInstances,
  useReparseLogGroup,
} from "@/api/queries";
import { AdminOutdatedInstancesPage } from "./AdminOutdatedInstancesPage";

vi.mock("@/api/queries", () => ({
  useAdminOutdatedInstances: vi.fn(),
  useBulkReparseOutdatedInstances: vi.fn(),
  useReparseLogGroup: vi.fn(),
}));

function mutationState() {
  return {
    mutate: vi.fn(),
    isPending: false,
  };
}

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AdminOutdatedInstancesPage />
    </MemoryRouter>
  );
}

describe("AdminOutdatedInstancesPage", () => {
  beforeEach(() => {
    vi.mocked(useAdminOutdatedInstances).mockReturnValue({
      data: {
        min_version: "v1.0.243",
        instances: [
          {
            id: "instance-id",
            log_group_id: "log-id",
            name: "Ulduar",
            slug: "ulduar-slug",
            parser_version: "v1.0.242",
            difficulty_name: "",
            max_players: 0,
            realm_name: "ChromieCraft",
            uploader_name: "Emyrk",
            uploaded_at: "2026-11-07T15:44:41Z",
            elapsed_seconds: 120,
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminOutdatedInstances>);
    vi.mocked(useBulkReparseOutdatedInstances).mockReturnValue(
      mutationState() as unknown as ReturnType<typeof useBulkReparseOutdatedInstances>
    );
    vi.mocked(useReparseLogGroup).mockReturnValue(
      mutationState() as unknown as ReturnType<typeof useReparseLogGroup>
    );
  });

  it("offers missing metadata filtering and shows the metadata columns", () => {
    const markup = render();

    expect(markup).toContain("Missing difficulty or player size");
    expect(markup).toContain("Difficulty");
    expect(markup).toContain("Players");
    expect(markup).toContain("Ulduar");
    expect(useAdminOutdatedInstances).toHaveBeenCalledWith(undefined, undefined, false);
  });
});
