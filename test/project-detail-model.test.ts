import { describe, expect, it } from "vitest";
import type { Project, StudySession, Task } from "@/lib/api";
import { buildProjectDetailModel } from "@/lib/project-detail-model";

const project = (id: number, parentId: number | null, overrides: Partial<Project> = {}): Project => ({
  id, parentId, name: `Project ${id}`, path: `Project ${id}`, depth: parentId === null ? 1 : 2,
  icon: null, description: null, resources: null, pinned: false, archived: false, sortOrder: id, lastUsedAt: null,
  ...overrides,
});

describe("buildProjectDetailModel", () => {
  it("derives hierarchy, work lists, and statistics for the selected project", () => {
    const projects = [project(1, null), project(2, 1), project(3, 2), project(4, null)];
    const tasks: Task[] = [
      { id: 1, project_id: 2, period_start: null, title: "Backlog", description: null, completed_at: null },
      { id: 2, project_id: 2, period_start: "2026-08-02", title: "Done", description: null, completed_at: "2026-08-02" },
      { id: 3, project_id: 4, period_start: null, title: "Other", description: null, completed_at: null },
    ];
    const sessions: StudySession[] = [
      { id: 1, project_id: 2, project_name: "Project 2", project_icon: null, started_at: "2026-08-02T10:00:00Z", ended_at: "2026-08-02T10:05:00Z", duration_seconds: 300, description: null },
      { id: 2, project_id: 2, project_name: "Project 2", project_icon: null, started_at: "2026-08-02T11:00:00Z", ended_at: null, duration_seconds: null, description: null },
    ];

    const model = buildProjectDetailModel(2, projects, tasks, sessions, Date.parse("2026-08-02T11:02:00Z"));

    expect(model.ancestors.map((item) => item.id)).toEqual([1]);
    expect(model.descendants.map((item) => [item.project.id, item.treeDepth])).toEqual([[3, 0]]);
    expect(model.backlogTasks.map((item) => item.id)).toEqual([1]);
    expect(model.completedTaskCount).toBe(1);
    expect(model.trackedSeconds).toBe(420);
    expect(model.lastSession?.id).toBe(2);
    expect(model.parentCandidates.map((item) => item.project.id)).toEqual([1, 4]);
  });
});
