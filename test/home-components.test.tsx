import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveTaskRail } from "@/components/home/active-task-rail";
import { FinishSessionDialog } from "@/components/home/finish-session-dialog";
import { SessionDetailDialog } from "@/components/home/session-detail-dialog";
import { TimerCard } from "@/components/home/timer-card";
import { TodayRail } from "@/components/home/today-rail";
import type { Project, StudySession, Task } from "@/lib/api";

vi.mock("@/components/task-creator-popover", () => ({
  TaskCreatorPopover: ({ onCreated }: { onCreated: (task: Task) => void }) => (
    <button type="button" aria-label="Add task" onClick={() => onCreated(createdTask)}>Add task</button>
  ),
}));

vi.mock("@/components/task-editor-popover", () => ({
  TaskEditorPopover: ({ task, onUpdated }: { task: Task; onUpdated: (task: Task) => void }) => (
    <button type="button" aria-label={`Edit ${task.title}`} onClick={() => onUpdated({ ...task, title: "Updated task" })}>Edit</button>
  ),
}));

vi.mock("@/components/project-creator-popover", () => ({
  ProjectCreatorPopover: ({ onCreated }: { onCreated: (project: Project) => void }) => (
    <button type="button" aria-label="New project" onClick={() => onCreated(createdProject)}>New project</button>
  ),
}));

const project: Project = {
  id: 1,
  name: "Sentinel",
  path: "Sentinel",
  depth: 1,
  parentId: null,
  icon: null,
  description: null,
  resources: null,
  pinned: true,
  archived: false,
  sortOrder: 0,
  lastUsedAt: null,
};

const openTask: Task = {
  id: 10,
  period_start: "2026-08-02",
  project_id: project.id,
  title: "Review Home",
  description: null,
  completed_at: null,
};

const completedTask: Task = {
  ...openTask,
  id: 11,
  title: "Finished task",
  completed_at: "2026-08-02T10:00:00.000Z",
};

const createdTask: Task = { ...openTask, id: 12, title: "Created task" };
const createdProject: Project = { ...project, id: 2, name: "New project", path: "New project" };

describe("TodayRail", () => {
  it("selects work and exposes project and create commands", () => {
    const onProjectSelect = vi.fn();
    const onTaskSelect = vi.fn();
    const onTaskCreated = vi.fn();
    render(
      <TodayRail
        exiting={false}
        loaded
        isRunning={false}
        refreshingActive={false}
        todayKey="2026-08-02"
        trackedSeconds={0}
        groups={[{ project, tasks: [openTask, completedTask] }]}
        todayTasks={[openTask, completedTask]}
        projects={[project]}
        projectId={project.id}
        selectedTaskIds={[openTask.id]}
        backlogSuggestions={[]}
        onProjectSelect={onProjectSelect}
        onTaskSelect={onTaskSelect}
        onTaskCreated={onTaskCreated}
      />,
    );

    const selected = screen.getByRole("button", { name: "Review Home" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(selected);
    expect(onTaskSelect).toHaveBeenCalledWith(openTask, true);

    fireEvent.click(screen.getByRole("button", { name: /Sentinel/ }));
    expect(onProjectSelect).toHaveBeenCalledWith(project.id);
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(onTaskCreated).toHaveBeenCalledWith(createdTask);
  });
});

describe("ActiveTaskRail", () => {
  const commonProps = {
    projects: [project],
    todayKey: "2026-08-02",
    projectId: project.id,
    sessionId: 22,
    todaySuggestions: [],
    backlogSuggestions: [],
    recentTaskIds: [],
    deletingTaskIds: [],
    loadStatus: "loaded" as const,
    onRetry: vi.fn(),
    onTaskCreated: vi.fn(),
    onTaskUpdated: vi.fn(),
    onToggleTask: vi.fn(),
    onDeleteTask: vi.fn(),
  };

  it("shows the active-session empty state and add command", () => {
    render(<ActiveTaskRail {...commonProps} tasks={[]} />);
    expect(screen.getByText("Select tasks to work on first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(commonProps.onTaskCreated).toHaveBeenCalledWith(createdTask);
  });

  it("runs toggle, edit, and delete commands for an active task", () => {
    render(<ActiveTaskRail {...commonProps} tasks={[openTask]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Review Home" }));
    expect(commonProps.onToggleTask).toHaveBeenCalledWith(openTask);
    fireEvent.click(screen.getByRole("button", { name: "Edit Review Home" }));
    expect(commonProps.onTaskUpdated).toHaveBeenCalledWith({ ...openTask, title: "Updated task" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Review Home" }));
    expect(commonProps.onDeleteTask).toHaveBeenCalledWith(openTask);
  });

  it("shows retryable unknown state without membership controls when loading fails", () => {
    render(<ActiveTaskRail {...commonProps} tasks={[]} loadStatus="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Task membership is unknown");
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
    expect(screen.queryByText("Select tasks to work on first")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(commonProps.onRetry).toHaveBeenCalledOnce();
  });
});

describe("TimerCard", () => {
  const callbacks = {
    onProjectChange: vi.fn(),
    onProjectCreated: vi.fn(),
    onDescriptionChange: vi.fn(),
    onStart: vi.fn(),
    onPauseToggle: vi.fn(),
    onRequestStop: vi.fn(),
    onEditStart: vi.fn(),
  };

  it("starts an idle timer and forwards draft changes", () => {
    render(
      <TimerCard
        isRunning={false}
        isPaused={false}
        busy={false}
        refreshingActive={false}
        elapsedMs={0}
        projects={[project]}
        projectId={project.id}
        activeProject={null}
        description=""
        descriptionStatus="idle"
        error={null}
        stopOpen={false}
        {...callbacks}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Include more details/), { target: { value: "Deep work" } });
    expect(callbacks.onDescriptionChange).toHaveBeenCalledWith("Deep work");
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    expect(callbacks.onStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(callbacks.onProjectCreated).toHaveBeenCalledWith(createdProject);
  });

  it("exposes pause, stop, and edit controls while running", () => {
    render(
      <TimerCard
        isRunning
        isPaused={false}
        busy={false}
        refreshingActive={false}
        elapsedMs={3_661_000}
        projects={[project]}
        projectId={project.id}
        activeProject={project}
        description="Working"
        descriptionStatus="saved"
        error={null}
        stopOpen={false}
        {...callbacks}
      />,
    );
    expect(screen.getByText("01:01:01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause for an interruption" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop session" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit start time" }));
    expect(callbacks.onPauseToggle).toHaveBeenCalledOnce();
    expect(callbacks.onRequestStop).toHaveBeenCalledOnce();
    expect(callbacks.onEditStart).toHaveBeenCalledOnce();
  });
});

describe("SessionDetailDialog", () => {
  const detailSession: StudySession = {
    id: 22,
    started_at: "2026-08-02T09:00:00.000Z",
    ended_at: "2026-08-02T10:00:00.000Z",
    duration_seconds: 3600,
    description: null,
    project_id: project.id,
    project_name: project.name,
    project_icon: null,
  };

  it("shows a visible retry action when detail tasks are unknown", () => {
    const onRetryTasks = vi.fn();
    render(
      <SessionDetailDialog
        session={detailSession}
        tasks={[]}
        tasksStatus="error"
        onRetryTasks={onRetryTasks}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this session's tasks");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryTasks).toHaveBeenCalledOnce();
  });
});

describe("FinishSessionDialog", () => {
  it("adjusts the split and exposes dismiss and finish commands", () => {
    const onOpenChange = vi.fn();
    const onProductionPercentageChange = vi.fn();
    const onFinish = vi.fn();
    render(
      <FinishSessionDialog
        open
        busy={false}
        error={null}
        trackProductionSplit
        productionPercentage={40}
        onOpenChange={onOpenChange}
        onProductionPercentageChange={onProductionPercentageChange}
        onFinish={onFinish}
      />,
    );

    expect(screen.getByText("Learning 60% · Producing 40%")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Learning and Producing allocation" }), { target: { value: "70" } });
    expect(onProductionPercentageChange).toHaveBeenCalledWith(70);
    fireEvent.click(screen.getByRole("button", { name: "Keep running" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    expect(onFinish).toHaveBeenCalledOnce();
  });
});
