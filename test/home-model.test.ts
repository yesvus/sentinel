import { describe, expect, it } from "vitest";
import type { Note, Project, StudySession, Task } from "@/lib/api";
import { buildHomeModel } from "@/lib/home-model";
import { combineLocalDateAndTime } from "@/lib/date";

const projects: Project[] = [
  { id: 2, name: "Writing", path: "B / Writing", icon: null, description: null, resources: null, parentId: null, pinned: false, archived: false, depth: 1, sortOrder: 0, lastUsedAt: null },
  { id: 1, name: "Research", path: "A / Research", icon: null, description: null, resources: null, parentId: null, pinned: false, archived: false, depth: 1, sortOrder: 0, lastUsedAt: null },
];

const tasks: Task[] = [
  { id: 1, period_start: "2026-08-02", project_id: 2, title: "Draft", description: null, completed_at: null, sort_order: 0 },
  { id: 2, period_start: "2026-08-02", project_id: 1, title: "Read", description: null, completed_at: null, sort_order: 0 },
  { id: 3, period_start: "2026-08-02", project_id: null, title: "Admin", description: null, completed_at: null, sort_order: 0 },
  { id: 4, period_start: null, project_id: 1, title: "Backlog", description: null, completed_at: null, sort_order: 0 },
  { id: 5, period_start: null, project_id: 1, title: "Done backlog", description: null, completed_at: "2026-08-01T12:00:00.000Z", sort_order: 0 },
  { id: 6, period_start: "2026-08-02", project_id: 1, title: "Done today", description: null, completed_at: "2026-08-02T12:00:00.000Z", sort_order: 0 },
  { id: 7, period_start: null, project_id: 2, title: "Other project backlog", description: null, completed_at: null, sort_order: 0 },
];

const notes: Note[] = [
  { id: 1, scope: "day", date_key: "2026-08-02", content: "Keep it focused", updated_at: "2026-08-02T08:00:00.000Z" },
];

const todaySessions: StudySession[] = [
  { id: 1, started_at: "2026-08-02T08:00:00.000Z", ended_at: "2026-08-02T08:30:00.000Z", duration_seconds: 1800, description: null, project_id: 1, project_name: "Research", project_icon: null },
];

describe("Home model", () => {
  it("groups today's tasks by project path with unassigned tasks last", () => {
    const model = buildHomeModel({ projects, tasks, notes, todaySessions, todayKey: "2026-08-02", projectId: 1, sessionTaskIds: [], now: Date.now() });

    expect(model.todayTaskGroups.map((group) => group.project?.name ?? "none")).toEqual(["Research", "Writing", "none"]);
    expect(model.todayTasks.map((task) => task.id)).not.toContain(6);
    expect(model.todayNote?.content).toBe("Keep it focused");
    expect(model.todayTrackedSeconds).toBe(1800);
  });

  it("keeps active tasks out of session suggestions and completed tasks out of backlog suggestions", () => {
    const model = buildHomeModel({ projects, tasks, notes, todaySessions, todayKey: "2026-08-02", projectId: 1, sessionTaskIds: [2, 4, 6], now: Date.now() });

    expect(model.runningProjectTasks.map((task) => task.id)).toEqual([2, 4, 6]);
    expect(model.todaySuggestions).toEqual([]);
    expect(model.backlogSuggestions.map((task) => task.id)).toEqual([7]);
    expect(model.activeBacklogSuggestions).toEqual([]);
    expect(model.activeProject?.name).toBe("Research");
  });

  it("combines a time with the original local calendar day", () => {
    const base = new Date(2026, 7, 2, 23, 45).getTime();
    const combined = combineLocalDateAndTime(base, "07:15");

    expect([combined.getFullYear(), combined.getMonth(), combined.getDate(), combined.getHours(), combined.getMinutes()]).toEqual([2026, 7, 2, 7, 15]);
  });
});
