import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompletedTaskCreateForm } from "@/components/sessions/completed-task-create-form";
import { CompletedTaskPicker } from "@/components/sessions/completed-task-picker";
import { ApiError, type Task } from "@/lib/api";

const { createTask } = vi.hoisted(() => ({ createTask: vi.fn() }));

vi.mock("@/lib/api", () => {
  class MockApiError extends Error {
    constructor(public status: number, message: string, public body?: unknown) {
      super(message);
    }
  }
  return {
    ApiError: MockApiError,
    tasks: { create: createTask },
  };
});

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

const backlogTask: Task = {
  id: 1,
  period_start: null,
  project_id: 7,
  title: "Backlog task",
  description: null,
  completed_at: null,
};

const completedTask: Task = {
  id: 2,
  period_start: "2026-08-01",
  project_id: 7,
  title: "Completed task",
  description: "Already finished",
  completed_at: "2026-08-01T10:00:00.000Z",
};

describe("CompletedTaskPicker", () => {
  it("adds and removes available tasks from the supplied selection", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <CompletedTaskPicker
        sessionId={30}
        projectId={7}
        periodStart="2026-08-01"
        availableTasks={[backlogTask, completedTask]}
        selectedTaskIds={[completedTask.id]}
        disabled={false}
        onSelectionChange={onSelectionChange}
        onTaskCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: backlogTask.title }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([completedTask.id, backlogTask.id]);

    rerender(
      <CompletedTaskPicker
        sessionId={30}
        projectId={7}
        periodStart="2026-08-01"
        availableTasks={[backlogTask, completedTask]}
        selectedTaskIds={[completedTask.id]}
        disabled={false}
        onSelectionChange={onSelectionChange}
        onTaskCreated={vi.fn()}
        onError={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: completedTask.title }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });
});

describe("CompletedTaskCreateForm", () => {
  beforeEach(() => {
    createTask.mockReset();
  });

  it("trims input, creates a completed session task, and reports the result", async () => {
    const created = { ...completedTask, id: 9, title: "Ship tests", description: "Coverage details" };
    createTask.mockResolvedValue(created);
    const onCreated = vi.fn();
    const onError = vi.fn();
    render(
      <CompletedTaskCreateForm
        sessionId={30}
        projectId={7}
        periodStart="2026-08-01"
        onCreated={onCreated}
        onCancel={vi.fn()}
        onError={onError}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Ship tests  " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "  Coverage details  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(onError).toHaveBeenCalledWith(null);
    expect(createTask).toHaveBeenCalledWith("2026-08-01", "Ship tests", 7, "Coverage details", 30, true);
  });

  it("reports API messages and does not emit a created task on failure", async () => {
    createTask.mockRejectedValue(new ApiError(409, "Task already exists"));
    const onCreated = vi.fn();
    const onError = vi.fn();
    render(
      <CompletedTaskCreateForm
        sessionId={30}
        projectId={null}
        periodStart="2026-08-01"
        onCreated={onCreated}
        onCancel={vi.fn()}
        onError={onError}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Duplicate" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("Task already exists"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("uses the generic message for unexpected failures", async () => {
    createTask.mockRejectedValue(new Error("offline"));
    const onError = vi.fn();
    render(
      <CompletedTaskCreateForm
        sessionId={30}
        projectId={null}
        periodStart="2026-08-01"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
        onError={onError}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(onError).toHaveBeenLastCalledWith("Could not create this completed task."));
  });
});
