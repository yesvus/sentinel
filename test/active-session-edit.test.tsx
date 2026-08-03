import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistorySection } from "@/components/history-section";
import { SessionEditorDialog } from "@/components/session-editor-dialog";
import type { StudySession, Task } from "@/lib/api";

const { updateSession, deleteSession, updateTask, toastAdd } = vi.hoisted(() => ({
  updateSession: vi.fn().mockResolvedValue({}),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  updateTask: vi.fn(),
  toastAdd: vi.fn(),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {}
  return {
    ApiError,
    sessions: {
      createManual: vi.fn(),
    },
    tasks: {
      update: updateTask,
    },
  };
});

vi.mock("@/components/ui/toast", () => ({
  toast: { add: toastAdd },
}));

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
    updateTask.mockReset();
    toastAdd.mockReset();
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

  it("keeps a failed deletion visible and reports the failure", async () => {
    const active: StudySession = {
      id: 46,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: null,
      description: "Keep this session",
      project_id: null,
      project_name: null,
      project_icon: null,
    };
    const onSessionsChange = vi.fn();
    deleteSession.mockRejectedValueOnce(new Error("offline"));

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

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: "error",
      title: "Could not delete session",
    })));
    expect(onSessionsChange).not.toHaveBeenCalled();
    expect(screen.getByText("Keep this session")).toBeInTheDocument();
  });

  it("removes an undone attached task from the subsequent save payload", async () => {
    const now = Date.now();
    const completed: StudySession = {
      id: 47,
      started_at: new Date(now - 60 * 60 * 1000).toISOString(),
      ended_at: new Date(now - 30 * 60 * 1000).toISOString(),
      duration_seconds: 1800,
      description: "Completed work",
      project_id: null,
      project_name: null,
      project_icon: null,
    };
    const attachedTask: Task = {
      id: 8,
      period_start: "2026-08-02",
      project_id: null,
      title: "Attached task",
      description: null,
      completed_at: "2026-08-02T10:00:00.000Z",
      sort_order: 0,
    };
    const undoneTask: Task = {
      ...attachedTask,
      period_start: null,
      completed_at: null,
    };
    updateTask.mockResolvedValueOnce(undoneTask);

    render(
      <SessionEditorDialog
        session={completed}
        tasks={[attachedTask]}
        availableTasks={[attachedTask]}
        onUpdated={vi.fn()}
        onTaskUpdated={vi.fn()}
        onTasksChanged={vi.fn()}
        onTaskCreated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit session starting at/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Attached task" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark undone" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move to Backlog" }));

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith(attachedTask.id, {
      completed: false,
      periodStart: null,
    }));
    await waitFor(() => expect(screen.getByText("No completed tasks attached.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateSession).toHaveBeenCalledWith(47, expect.objectContaining({
      taskIds: [],
    })));
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
      sort_order: 0,
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
