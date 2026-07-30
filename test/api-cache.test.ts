import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, clearApiCache } from "@/lib/api";

describe("authenticated client cache", () => {
  beforeEach(() => {
    clearApiCache();
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent project requests and invalidates after a mutation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "PATCH"
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify([{ id: 1, name: "Project" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
    );

    await Promise.all([api("/api/projects"), api("/api/projects")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api("/api/projects");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await api("/api/projects/1", { method: "PATCH", body: "{}" });
    await api("/api/projects");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
