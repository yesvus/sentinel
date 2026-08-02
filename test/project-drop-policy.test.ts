import { describe, expect, it } from "vitest";
import type { Project } from "@/lib/api";
import { projectDropIntent, resolveProjectDrop } from "@/lib/project-drop-policy";

const project = (id: number, parentId: number | null, sortOrder = id, pinned = false): Project => ({
  id, parentId, sortOrder, pinned, name: `Project ${id}`, path: `Project ${id}`, depth: parentId === null ? 1 : 2,
  icon: null, description: null, resources: null, archived: false, lastUsedAt: null,
});

describe("project drop policy", () => {
  it("maps row zones to before, inside, and after intents", () => {
    const projects = [project(1, null), project(2, null)];
    expect(projectDropIntent(projects, projects[0], projects[1], 0.1)?.position).toBe("before");
    expect(projectDropIntent(projects, projects[0], projects[1], 0.5)?.position).toBe("inside");
    expect(projectDropIntent(projects, projects[0], projects[1], 0.9)?.position).toBe("after");
  });

  it("falls back to a sibling position when nesting would exceed the depth limit", () => {
    const projects = [project(1, null), project(2, 1), project(3, null), project(4, 3), project(5, 4)];
    expect(projectDropIntent(projects, projects[1], projects[4], 0.4)).toEqual({ targetId: 5, position: "before" });
  });

  it("resolves sibling and root positions within the moving project's pin group", () => {
    const projects = [project(1, null, 0), project(2, null, 1), project(3, null, 2), project(4, null, 0, true)];
    expect(resolveProjectDrop(projects, projects[2], { targetId: 1, position: "after" }, false)).toEqual({ parentId: null, position: 1 });
    expect(resolveProjectDrop(projects, projects[2], null, true)).toEqual({ parentId: null, position: 2 });
  });

  it("rejects self targets and missing intents", () => {
    const projects = [project(1, null)];
    expect(projectDropIntent(projects, projects[0], projects[0], 0.5)).toBeNull();
    expect(resolveProjectDrop(projects, projects[0], null, false)).toBeNull();
  });
});
