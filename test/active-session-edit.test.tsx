import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistorySection } from "@/components/history-section";
import type { StudySession } from "@/lib/api";

const { update, notifySessionChanged } = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue({}),
  notifySessionChanged: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {}
  return {
    ApiError,
    sessions: {
      update,
      remove: vi.fn(),
      createManual: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { trackProductionSplit: true }, loading: false, refresh: vi.fn() }),
}));

vi.mock("@/lib/active-session-context", () => ({
  useActiveSession: () => ({ notifySessionChanged }),
}));

describe("active session editing", () => {
  beforeEach(() => {
    update.mockClear();
    notifySessionChanged.mockClear();
  });

  it("shows an ongoing session with a disabled end time", async () => {
    const now = Date.now();
    const active: StudySession = {
      id: 42,
      started_at: new Date(now - 30 * 60 * 1000).toISOString(),
      ended_at: null,
      duration_seconds: null,
      description: "Running work",
      project_id: null,
      project_name: null,
      project_icon: null,
    };

    render(
      <HistorySection
        sessions={[active]}
        projects={[]}
        notes={[]}
        tasks={[]}
        now={now}
        hasMore={false}
        loadingMore={false}
        loadMoreError={null}
        onLoadMore={vi.fn()}
        onSessionsChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit session" }));
    expect(await screen.findByText("Update the running session without stopping it.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Ongoing session/ })).toBeChecked();
    expect(screen.getByLabelText("End time")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toMatchObject({
      endedAt: null,
      productionPercentage: null,
    });
  });

  it("can turn a completed session into an ongoing session", async () => {
    const now = Date.now();
    const completed: StudySession = {
      id: 43,
      started_at: new Date(now - 60 * 60 * 1000).toISOString(),
      ended_at: new Date(now - 30 * 60 * 1000).toISOString(),
      duration_seconds: 30 * 60,
      description: "Completed work",
      project_id: null,
      project_name: null,
      project_icon: null,
      production_percentage: 50,
    };

    render(
      <HistorySection
        sessions={[completed]}
        projects={[]}
        notes={[]}
        tasks={[]}
        now={now}
        hasMore={false}
        loadingMore={false}
        loadMoreError={null}
        onLoadMore={vi.fn()}
        onSessionsChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit session" }));
    const ongoing = await screen.findByRole("checkbox", { name: /Ongoing session/ });
    expect(ongoing).not.toBeChecked();
    expect(screen.getByLabelText("End time")).toBeEnabled();

    fireEvent.click(ongoing);
    expect(screen.getByLabelText("End time")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toMatchObject({
      endedAt: null,
      productionPercentage: null,
    });
  });
});
