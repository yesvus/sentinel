import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistorySection } from "@/components/history-section";
import { SessionEditorDialog } from "@/components/session-editor-dialog";
import type { StudySession, Task } from "@/lib/api";

const { updateSession, deleteSession } = vi.hoisted(() => ({
  updateSession: vi.fn().mockResolvedValue({}),
  deleteSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {}
  return {
    ApiError,
    sessions: {
      createManual: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { trackProductionSplit: true }, loading: false, refresh: vi.fn() }),
}));

vi.mock("@/lib/active-session-context", () => ({
  useActiveSession: () => ({ updateSession, deleteSession }),
}));

describe("active session editing", () => {
  beforeEach(() => {
    updateSession.mockClear();
    deleteSession.mockClear();
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
    await waitFor(() => expect(updateSession).toHaveBeenCalledOnce());
    expect(updateSession.mock.calls[0][1]).toMatchObject({
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

    await waitFor(() => expect(updateSession).toHaveBeenCalledOnce());
    expect(updateSession.mock.calls[0][1]).toMatchObject({
      endedAt: null,
      productionPercentage: null,
    });
  });

  it("deletes through the provider before removing the active row", async () => {
    const active: StudySession = {
      id: 44,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: null,
      description: "Running work",
      project_id: null,
      project_name: null,
      project_icon: null,
    };
    const onSessionsChange = vi.fn();

    render(
      <HistorySection
        sessions={[active]}
        projects={[]}
        notes={[]}
        tasks={[]}
        now={Date.now()}
        hasMore={false}
        loadingMore={false}
        loadMoreError={null}
        onLoadMore={vi.fn()}
        onSessionsChange={onSessionsChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteSession).toHaveBeenCalledWith(44));
    expect(onSessionsChange).toHaveBeenCalledOnce();
    expect(onSessionsChange.mock.calls[0][0]([active])).toEqual([]);
  });

  it("keeps task synchronization results from the provider-owned update", async () => {
    const now = Date.now();
    const completed: StudySession = {
      id: 45,
      started_at: new Date(now - 60 * 60 * 1000).toISOString(),
      ended_at: new Date(now - 30 * 60 * 1000).toISOString(),
      duration_seconds: 1800,
      description: "Completed work",
      project_id: null,
      project_name: null,
      project_icon: null,
    };
    const changedTask: Task = {
      id: 2,
      period_start: new Date().toISOString().slice(0, 10),
      project_id: null,
      title: "Changed task",
      description: null,
      completed_at: new Date().toISOString(),
    };
    updateSession.mockResolvedValueOnce({
      id: 45,
      startedAt: completed.started_at,
      endedAt: completed.ended_at,
      durationSeconds: 1800,
      description: completed.description,
      projectId: null,
      productionPercentage: null,
      attachedTasks: [changedTask],
      changedTasks: [changedTask],
    });
    const onTaskUpdated = vi.fn();
    const onTasksChanged = vi.fn();

    render(
      <SessionEditorDialog
        session={completed}
        tasks={[]}
        availableTasks={[]}
        onUpdated={vi.fn()}
        onTaskUpdated={onTaskUpdated}
        onTasksChanged={onTasksChanged}
        onTaskCreated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit session starting at/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateSession).toHaveBeenCalledWith(45, expect.any(Object)));
    expect(onTaskUpdated).toHaveBeenCalledWith(changedTask);
    expect(onTasksChanged).toHaveBeenCalledWith(45, [changedTask]);
  });
});
