import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TasksPage from "@/app/app/tasks/page";
import type { Project, Task } from "@/lib/api";

const { listTasks, listProjects, createTask } = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listProjects: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {}
  return {
    ApiError,
    tasks: { list: listTasks, create: createTask },
    projects: { list: listProjects },
  };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { timezone: null } }),
}));

vi.mock("@/components/project-selector", () => ({
  ProjectSelector: () => <button type="button">Choose project</button>,
}));

vi.mock("@/components/task-editor-popover", () => ({
  TaskEditorPopover: () => null,
}));

vi.mock("@/components/task-creator-popover", () => ({
  TaskCreatorPopover: ({ defaultProjectId, projectLocked, onCreated }: {
    defaultProjectId?: number | null;
    projectLocked?: boolean;
    onCreated: (task: Task) => void;
  }) => (
    <button
      type="button"
      aria-label={`Add task to ${defaultProjectId ?? "No project"}${projectLocked ? "" : " (unlocked)"}`}
      onClick={() => onCreated({
        id: 100,
        period_start: null,
        project_id: defaultProjectId ?? null,
        title: "New scoped task",
        description: null,
        completed_at: null,
        sort_order: 0,
      })}
    >
      Add scoped task
    </button>
  ),
}));

const projects: Project[] = [
  {
    id: 1,
    name: "Alpha",
    path: "Work / Alpha",
    depth: 2,
    parentId: null,
    icon: null,
    description: null,
    resources: null,
    pinned: false,
    archived: false,
    sortOrder: 0,
    lastUsedAt: null,
  },
  {
    id: 2,
    name: "Archive",
    path: "Old / Archive",
    depth: 2,
    parentId: null,
    icon: null,
    description: null,
    resources: null,
    pinned: false,
    archived: true,
    sortOrder: 1,
    lastUsedAt: null,
  },
];

const tasks: Task[] = [
  {
    id: 10,
    period_start: null,
    project_id: 1,
    title: "Write release notes",
    description: "Include the planning decisions",
    completed_at: null,
    sort_order: 0,
  },
  {
    id: 11,
    period_start: null,
    project_id: 1,
    title: "Ship build",
    description: null,
    completed_at: null,
    sort_order: 0,
  },
  {
    id: 12,
    period_start: null,
    project_id: 2,
    title: "Store records",
    description: null,
    completed_at: null,
    sort_order: 0,
  },
  {
    id: 13,
    period_start: null,
    project_id: null,
    title: "Loose task",
    description: null,
    completed_at: null,
    sort_order: 0,
  },
];

describe("Tasks page", () => {
  beforeEach(() => {
    listTasks.mockReset().mockResolvedValue(tasks);
    listProjects.mockReset().mockResolvedValue(projects);
    createTask.mockReset();
  });

  it("filters tasks case-insensitively by task and project details", async () => {
    render(<TasksPage />);
    const search = await screen.findByRole("searchbox", { name: "Search backlog" });

    fireEvent.change(search, { target: { value: "PLANNING" } });
    expect(screen.getByText("Write release notes")).toBeInTheDocument();
    expect(screen.queryByText("Ship build")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 4")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "work / ALPHA" } });
    expect(screen.getByText("Write release notes")).toBeInTheDocument();
    expect(screen.getByText("Ship build")).toBeInTheDocument();
    expect(screen.getByText("2 of 4")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "not present" } });
    expect(screen.getByText("No matching backlog tasks")).toBeInTheDocument();
    expect(screen.getByText("0 of 4")).toBeInTheDocument();
  });

  it("creates into the selected group locally and disables creation for archived projects", async () => {
    render(<TasksPage />);

    const addToAlpha = await screen.findByRole("button", { name: "Add task to 1" });
    expect(screen.getByRole("button", { name: "Add task to No project" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add task to 2" })).not.toBeInTheDocument();

    fireEvent.click(addToAlpha);
    expect(screen.getByText("New scoped task")).toBeInTheDocument();
    expect(screen.getByText("5 total")).toBeInTheDocument();
  });

  it("sends the backlog description and only resets fields after success", async () => {
    createTask
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        id: 101,
        period_start: null,
        project_id: null,
        title: "Document behavior",
        description: "Failure details",
        completed_at: null,
      });
    render(<TasksPage />);

    const title = await screen.findByLabelText("Task title");
    const description = screen.getByLabelText("Description (optional)");
    fireEvent.change(title, { target: { value: "  Document behavior  " } });
    fireEvent.change(description, { target: { value: "  Failure details  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText("Could not add task.")).toBeInTheDocument();
    expect(title).toHaveValue("  Document behavior  ");
    expect(description).toHaveValue("  Failure details  ");

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(createTask).toHaveBeenLastCalledWith(
      null,
      "Document behavior",
      null,
      "Failure details",
    ));
    await waitFor(() => {
      expect(title).toHaveValue("");
      expect(description).toHaveValue("");
    });
  });
});
