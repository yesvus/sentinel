import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeTasks } from "@/hooks/use-home-tasks";
import type { Task } from "@/lib/api";

const { loadSessionTasks } = vi.hoisted(() => ({ loadSessionTasks: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, sessions: { ...actual.sessions, tasks: loadSessionTasks } };
});

const createdTask: Task = {
  id: 12,
  period_start: "2026-08-02",
  project_id: 1,
  title: "Created task",
  description: null,
  completed_at: null,
  sort_order: 0,
};

function Harness({ sessionId, running = true }: { sessionId: number | null; running?: boolean }) {
  const [, setTaskList] = useState<Task[]>([]);
  const tasks = useHomeTasks({
    activeSessionId: sessionId,
    isRunning: running,
    projectId: 1,
    setTaskList,
    onProjectChange: vi.fn(),
    onError: vi.fn(),
  });
  return (
    <div>
      <span data-testid="status">{tasks.sessionTasksLoadStatus}</span>
      <span data-testid="ids">{tasks.sessionTaskIds.join(",")}</span>
      <span data-testid="selected-ids">{tasks.selectedTaskIds.join(",")}</span>
      <button type="button" onClick={tasks.retrySessionTasks}>Retry</button>
      <button type="button" onClick={() => tasks.todayTaskCreated(createdTask)}>Create today</button>
      <button type="button" onClick={() => tasks.activeTaskCreated(createdTask)}>Create active</button>
      <button type="button" onClick={() => tasks.selectProjectTasks(1, [createdTask])}>Select project tasks</button>
      <button type="button" onClick={() => tasks.seedSessionTasks([createdTask.id])}>Seed session tasks</button>
      <button type="button" onClick={tasks.clearOptimisticSessionTasks}>Clear seed</button>
    </div>
  );
}

describe("useHomeTasks session membership", () => {
  beforeEach(() => loadSessionTasks.mockReset());

  it("exposes load failure and retries the active session", async () => {
    loadSessionTasks.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([createdTask]);
    render(<Harness sessionId={22} />);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    expect(screen.getByTestId("ids")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("loaded"));
    expect(screen.getByTestId("ids")).toHaveTextContent("12");
    expect(loadSessionTasks).toHaveBeenCalledTimes(2);
  });

  it("clears membership on a session change before the next request resolves", async () => {
    let resolveSecond: (tasks: Task[]) => void = () => {};
    loadSessionTasks
      .mockResolvedValueOnce([createdTask])
      .mockImplementationOnce(() => new Promise<Task[]>((resolve) => { resolveSecond = resolve; }));
    const view = render(<Harness sessionId={22} />);
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("12"));

    view.rerender(<Harness sessionId={23} />);
    expect(screen.getByTestId("ids")).toBeEmptyDOMElement();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    resolveSecond([]);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("loaded"));
  });

  it("does not attach a task created from Today while the rail exits", async () => {
    loadSessionTasks.mockResolvedValue([]);
    render(<Harness sessionId={22} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("loaded"));

    fireEvent.click(screen.getByRole("button", { name: "Create today" }));
    expect(screen.getByTestId("ids")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Create active" }));
    expect(screen.getByTestId("ids")).toHaveTextContent("12");
  });

  it("selects every project task and deselects them on the second click", () => {
    render(<Harness sessionId={null} running={false} />);
    const trigger = screen.getByRole("button", { name: "Select project tasks" });

    fireEvent.click(trigger);
    expect(screen.getByTestId("selected-ids")).toHaveTextContent("12");
    fireEvent.click(trigger);
    expect(screen.getByTestId("selected-ids")).toBeEmptyDOMElement();
  });

  it("exposes and clears optimistic task membership before a session is available", () => {
    render(<Harness sessionId={null} running={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Seed session tasks" }));
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(screen.getByTestId("ids")).toHaveTextContent("12");
    fireEvent.click(screen.getByRole("button", { name: "Clear seed" }));
    expect(screen.getByTestId("ids")).toBeEmptyDOMElement();
  });
});
