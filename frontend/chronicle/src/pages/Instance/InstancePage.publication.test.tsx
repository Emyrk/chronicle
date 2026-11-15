import { describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ id: "publication-a", pending: true }));
vi.mock("./publicationPolling", () => ({ usePublicationPolling: () => ({ enabled: true }) }));
vi.mock("react", async (importOriginal) => ({ ...await importOriginal<typeof import("react")>(), useEffect: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => ({ ...await importOriginal<typeof import("react-router-dom")>(), useParams: () => ({ instanceId: "stable-slug" }), useNavigate: () => vi.fn() }));
vi.mock("@/api/queries", async (importOriginal) => ({ ...await importOriginal<typeof import("@/api/queries")>(), useInstance: () => ({ data: { id: query.id, slug: "stable-slug", publication_pending: query.pending }, isLoading: false, error: null }) }));

import { InstancePage } from "./InstancePage";

describe("resolved instance publication boundary", () => {
  it("keys the entire selection/provider/panel runtime by database ID rather than the stable slug", () => {
    query.id = "publication-a";
    const before = InstancePage();
    query.id = "publication-b";
    query.pending = false;
    const after = InstancePage();
    expect(before.key).toBe("publication-a");
    expect(after.key).toBe("publication-b");
    expect(before.type).toBe(after.type);
    // A different React key remounts this component, including its selection hooks
    // and every provider/panel/filter below it; a slug key would preserve them.
    expect(after.props.apiInstance.id).toBe("publication-b");
    expect(after.props.apiInstance.publication_pending).toBe(false);
  });
});
