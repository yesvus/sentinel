import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanningPeriodStats, shouldShowPlanningComparison } from "@/components/planning-period-stats";
import { PlanningWeekDayCard } from "@/components/planning-week-day-card";
import type { Note, Project, StudySession, Task } from "@/lib/api";

const session: StudySession = {
  id: 1,
  started_at: "2026-08-03T08:00:00.000Z",
  ended_at: "2026-08-03T09:00:00.000Z",
  duration_seconds: 3600,
  description: null,
  project_id: 1,
  project_name: "Algebra",
  project_icon: null,
};

describe("planning period comparisons", () => {
  it("disables comparisons for future days and weeks only", () => {
    const now = new Date(2026, 7, 5, 12).getTime();

    expect(shouldShowPlanningComparison("day", new Date(2026, 7, 5), now)).toBe(true);
    expect(shouldShowPlanningComparison("day", new Date(2026, 7, 6), now)).toBe(false);
    expect(shouldShowPlanningComparison("week", new Date(2026, 7, 9), now)).toBe(true);
    expect(shouldShowPlanningComparison("week", new Date(2026, 7, 10), now)).toBe(false);
  });

  it("hides the day delta without hiding the total or project breakdown", () => {
    render(
      <PlanningPeriodStats
        period="day"
        sessions={[session]}
        previousSessions={[]}
        now={Date.parse("2026-08-03T10:00:00.000Z")}
        date={new Date(2026, 7, 4)}
        showComparison={false}
      />,
    );

    expect(screen.getByText("Day activity")).toBeInTheDocument();
    expect(screen.getAllByText("1h 0m")).not.toHaveLength(0);
    expect(screen.getByText("Algebra")).toBeInTheDocument();
    expect(screen.queryByText(/vs yesterday/)).not.toBeInTheDocument();
  });

  it("hides the week delta without hiding the chart or weekly total", () => {
    render(
      <PlanningPeriodStats
        period="week"
        sessions={[session]}
        previousSessions={[]}
        now={Date.parse("2026-08-03T10:00:00.000Z")}
        date={new Date(2026, 7, 3)}
        showComparison={false}
      />,
    );

    expect(screen.getByText("Week activity")).toBeInTheDocument();
    expect(screen.getByText("Weekly total")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monday, Algebra/ })).toBeInTheDocument();
    expect(screen.queryByText(/vs previous week/)).not.toBeInTheDocument();
  });
});

describe("weekly planning day card", () => {
  const date = new Date(2026, 7, 3);
  const task: Task = {
    id: 10,
    period_start: "2026-08-03",
    project_id: 1,
    title: "Review equations",
    description: null,
    completed_at: null,
  };
  const completedTask: Task = { ...task, id: 11, title: "Already finished", completed_at: "2026-08-03T09:00:00.000Z" };
  const note: Note = {
    id: 20,
    scope: "day",
    date_key: "2026-08-03",
    content: "Write up the proof",
    updated_at: "2026-08-03T09:00:00.000Z",
  };
  const project: Project = {
    id: 1,
    name: "Algebra",
    icon: null,
    description: null,
    resources: null,
    parentId: null,
    pinned: false,
    archived: false,
    path: "Algebra",
    depth: 0,
    sortOrder: 0,
    lastUsedAt: null,
  };

  it("groups open tasks by project and keeps sessions and notes in reserved regions", () => {
    render(
      <PlanningWeekDayCard
        date={date}
        isToday={false}
        tasks={[task, completedTask]}
        note={note}
        projects={[project]}
        sessions={[session]}
        trackedSeconds={3600}
        now={Date.parse("2026-08-03T10:00:00.000Z")}
        onOpen={vi.fn()}
      />,
    );

    const taskRegion = screen.getByRole("region", { name: "Mon tasks" });
    const sessionRegion = screen.getByRole("region", { name: "Mon sessions" });
    const noteRegion = screen.getByRole("region", { name: "Mon day note" });
    expect(within(taskRegion).getByText("Algebra")).toBeInTheDocument();
    expect(within(taskRegion).getByText("Review equations")).toBeInTheDocument();
    expect(within(taskRegion).queryByText("Already finished")).not.toBeInTheDocument();
    expect(within(taskRegion).queryByText("Write up the proof")).not.toBeInTheDocument();
    expect(within(sessionRegion).getByText(/Algebra/)).toBeInTheDocument();
    expect(within(noteRegion).getByText("Write up the proof")).toBeInTheDocument();
  });

  it("opens the whole card with pointer and keyboard interaction", () => {
    const onOpen = vi.fn();
    render(
      <PlanningWeekDayCard
        date={date}
        isToday
        tasks={[]}
        projects={[]}
        sessions={[]}
        trackedSeconds={0}
        now={Date.parse("2026-08-03T10:00:00.000Z")}
        onOpen={onOpen}
      />,
    );

    const card = screen.getByRole("link", { name: /Open Mon/ });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });
});
