import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeData } from "@/hooks/use-home-data";

const { listSessions, pageSessions } = vi.hoisted(() => ({
  listSessions: vi.fn(),
  pageSessions: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  notes: { list: vi.fn().mockResolvedValue([]) },
  projects: { list: vi.fn().mockResolvedValue([]) },
  tasks: { list: vi.fn().mockResolvedValue([]) },
  sessions: {
    list: listSessions,
    page: pageSessions,
    tasks: vi.fn().mockResolvedValue([]),
  },
}));

function Probe({ revision }: { revision: number }) {
  useHomeData(null, revision);
  return null;
}

describe("useHomeData", () => {
  beforeEach(() => {
    listSessions.mockReset().mockResolvedValue([]);
    pageSessions.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  });

  it("refreshes Today and Recent data when the shared session revision changes", async () => {
    const view = render(<Probe revision={0} />);
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
    expect(pageSessions).toHaveBeenCalledTimes(1);

    view.rerender(<Probe revision={1} />);
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2));
    expect(pageSessions).toHaveBeenCalledTimes(2);
  });
});
