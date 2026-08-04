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

    await Promise.all([api("/api/v1/projects"), api("/api/v1/projects")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api("/api/v1/projects");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await api("/api/v1/projects/1", { method: "PATCH", body: "{}" });
    await api("/api/v1/projects");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not let a stale in-flight GET repopulate cache after invalidation", async () => {
    let release!: (response: Response) => void;
    const stale = new Promise<Response>((resolve) => { release = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => stale)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 2, name: "Fresh" }]), { status: 200 }));

    const first = api<Array<{ id: number }>>("/api/v1/projects");
    await api("/api/v1/projects/1", { method: "PATCH", body: "{}" });
    release(new Response(JSON.stringify([{ id: 1, name: "Stale" }]), { status: 200 }));
    await first;

    await expect(api<Array<{ id: number }>>("/api/v1/projects")).resolves.toEqual([{ id: 2, name: "Fresh" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
