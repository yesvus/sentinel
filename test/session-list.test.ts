import { describe, expect, it, vi } from "vitest";
import { sessions as sessionsApi, type StudySession } from "@/lib/api";
import { mergeActiveSession, refreshSessionPage } from "@/lib/session-list";

function session(id: number, ended = true): StudySession {
  return {
    id,
    started_at: `2026-08-0${id}T10:00:00.000Z`,
    ended_at: ended ? `2026-08-0${id}T11:00:00.000Z` : null,
    duration_seconds: ended ? 3600 : null,
    description: null,
    project_id: null,
    project_name: null,
    project_icon: null,
  };
}

describe("mergeActiveSession", () => {
  it("replaces stale open rows with the provider-owned active session", () => {
    expect(mergeActiveSession([session(1), session(2, false)], session(3, false)).map((item) => item.id))
      .toEqual([3, 1]);
  });

  it("removes stale open rows when there is no active session", () => {
    expect(mergeActiveSession([session(1), session(2, false)], null).map((item) => item.id)).toEqual([1]);
  });

  it("does not add an active session outside a bounded consumer range", () => {
    expect(mergeActiveSession([session(1)], session(3, false), () => false).map((item) => item.id)).toEqual([1]);
  });

  it("refreshes pagination depth in API-sized chunks", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ ...session(1), id: index + 1 }));
    const second = Array.from({ length: 30 }, (_, index) => ({ ...session(1), id: index + 101 }));
    const page = vi.spyOn(sessionsApi, "page")
      .mockResolvedValueOnce({ items: first, nextCursor: "after-100" })
      .mockResolvedValueOnce({ items: second, nextCursor: "after-130" });

    await expect(refreshSessionPage(130)).resolves.toEqual({
      items: [...first, ...second],
      nextCursor: "after-130",
    });
    expect(page).toHaveBeenNthCalledWith(1, null, 100);
    expect(page).toHaveBeenNthCalledWith(2, "after-100", 30);
    page.mockRestore();
  });
});
