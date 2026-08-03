import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyTaskPlanner } from "@/components/daily-task-planner";
import { DayPlanningHeader } from "@/components/planning/day-planning-header";
import { DaySessionTimeline } from "@/components/planning/day-session-timeline";
import { buildDaySessionTimeline } from "@/components/planning/day-session-timeline-model";
import { tasks as tasksApi, type StudySession, type Task } from "@/lib/api";

const completedSession: StudySession = {
  id: 1,
  started_at: "2026-07-30T08:00:00.000Z",
  ended_at: "2026-07-30T09:00:00.000Z",
  duration_seconds: 3600,
  description: "Focused work",
  project_id: null,
  project_name: null,
  project_icon: null,
};

const completedTask: Task = {
  id: 10,
  period_start: "2026-07-30",
  project_id: null,
  title: "Finished task",
  description: null,
  completed_at: "2026-07-30T08:30:00.000Z",
};

describe("day session timeline model", () => {
  it("keeps duration and only exposes completed attached tasks", () => {
    const openTask = { ...completedTask, id: 11, title: "Open task", completed_at: null };
    const [item] = buildDaySessionTimeline(
      [completedSession],
      { [completedSession.id]: [openTask, completedTask] },
      new Date("2026-07-30T10:00:00.000Z").getTime(),
    );

    expect(item).toMatchObject({ running: false, duration: 3600 });
    expect(item.completedTasks).toEqual([completedTask]);
  });

  it("marks sessions without an end time as running", () => {
    const [item] = buildDaySessionTimeline(
      [{ ...completedSession, ended_at: null, duration_seconds: null }],
      {},
      new Date("2026-07-30T08:30:00.000Z").getTime(),
    );

    expect(item.running).toBe(true);
    expect(item.duration).toBe(1800);
  });
});

describe("day planning header", () => {
  it("summarizes the day and invokes prompt copying", () => {
    const onCopyPrompt = vi.fn();
    render(
      <DayPlanningHeader
        selectedDate={new Date(2026, 6, 30)}
        isToday
        openTaskCount={1}
        sessionCount={2}
        totalSessionSeconds={3600}
        onCopyPrompt={onCopyPrompt}
      />,
    );

    expect(screen.getByText("1 task left")).toBeInTheDocument();
    expect(screen.getByText("2 sessions")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText(/tracked/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy AI prompt" }));
    expect(onCopyPrompt).toHaveBeenCalledOnce();
  });
});

describe("day session task loading", () => {
  it("shows a retry and withholds membership editing when attached tasks are unknown", () => {
    const retry = vi.fn();
    render(
      <DaySessionTimeline
        sessions={[completedSession]}
        sessionTasks={{}}
        sessionTaskErrors={{ [completedSession.id]: "Could not load attached tasks." }}
        taskList={[completedTask]}
        totalSessionSeconds={3600}
        now={Date.parse("2026-07-30T10:00:00.000Z")}
        onSessionUpdated={vi.fn()}
        onTaskUpdated={vi.fn()}
        onSessionTasksChanged={vi.fn()}
        onSessionTaskCreated={vi.fn()}
        onRetrySessionTasks={retry}
      />,
    );

    expect(screen.getByText("Could not load attached tasks.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit session/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledWith(completedSession.id);
  });
});

describe("daily task failures", () => {
  it("surfaces completion and delete failures without removing the task", async () => {
    vi.spyOn(tasksApi, "update").mockRejectedValue(new Error("offline"));
    vi.spyOn(tasksApi, "remove").mockRejectedValue(new Error("offline"));
    const onUpdated = vi.fn();
    const onDeleted = vi.fn();
    render(
      <DailyTaskPlanner
        periodStart="2026-07-30"
        tasks={[{ ...completedTask, completed_at: null }]}
        projects={[]}
        backlogTasks={[]}
        onCreated={vi.fn()}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
        onProjectCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Mark "Finished task" done/ }));
    expect(await screen.findByText("Couldn't update task")).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    expect(await screen.findByText("Couldn't delete task")).toBeInTheDocument();
    expect(screen.getByText("Finished task")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
